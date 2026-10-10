import YAML from "yaml";
import type { Registry, EngineerEvent, IncomingBlock } from "./registry.ts";
import { readBlob } from "./blobs.ts";
import type { Skill, SkillFilter } from "./skill/store.ts";
import { BlueprintError, type Blueprint } from "./blueprint/store.ts";

// The ai API speaks YAML on the wire (application/yaml), like static / log.
// JSON request bodies still parse, since JSON is a subset of YAML.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function yamlRes(body: unknown, status = 200): Response {
  return new Response(YAML.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/yaml" },
  });
}

function errRes(status: number, code: string, message: string): Response {
  return yamlRes({ error: { code, message } }, status);
}

async function decode(req: Request): Promise<Record<string, any>> {
  const text = await req.text();
  if (!text.trim()) return {};
  const v = YAML.parse(text);
  if (v === null || typeof v !== "object") throw new Error("invalid yaml body");
  return v;
}

// SSE carries multi-line yaml as one "data:" line per yaml line; the client
// joins them back before parsing (per SSE spec). The frame's `id` is the event
// seq, so a reconnecting client can replay only what it missed.
function encodeSSE(ev: EngineerEvent): Uint8Array {
  const doc = YAML.stringify(ev).replace(/\n+$/, "");
  const payload =
    `id: ${ev.seq}\n` +
    doc
      .split("\n")
      .map((l) => `data: ${l}`)
      .join("\n") + "\n\n";
  return new TextEncoder().encode(payload);
}

// skillWire projects a stored skill onto the wire shape: camelCase fields, and
// `evidence` present only for suggested candidates.
function skillWire(t: Skill): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: t.id,
    name: t.name,
    text: t.text,
    source: t.source,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  if (t.evidence !== undefined) out.evidence = t.evidence;
  return out;
}

// blueprintWire projects a stored blueprint onto the wire shape.
function blueprintWire(b: Blueprint): Record<string, unknown> {
  return {
    id: b.id,
    name: b.name,
    entry: b.entry,
    files: b.files,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export function serve(registry: Registry, addr: string): void {
  // A bare ":port" means every interface — the launcher passes an explicit
  // host (loopback unless ENGINEER_BIND opened the stack up), so this only
  // applies when someone asks for it directly.
  const [host, portStr] = addr.startsWith(":")
    ? ["0.0.0.0", addr.slice(1)]
    : addr.split(":");
  const port = Number(portStr);

  Bun.serve({
    hostname: host,
    port,
    // SSE streams idle while the LLM thinks; disable Bun's 10s default.
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
      }
      // Content-addressed image bytes; immutable so the browser can cache hard.
      if (req.method === "GET" && url.pathname.startsWith("/blobs/")) {
        const blob = readBlob(
          registry.rootDir,
          url.pathname.slice("/blobs/".length),
        );
        if (!blob) return errRes(404, "not_found", "blob not found");
        return new Response(blob.bytes, {
          headers: {
            ...CORS,
            "Content-Type": blob.mimeType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
      if (req.method !== "POST") {
        return errRes(404, "not_found", "unknown endpoint");
      }
      let body: Record<string, any>;
      try {
        body = await decode(req);
      } catch (err) {
        return errRes(400, "bad_request", String(err));
      }

      switch (url.pathname) {
        case "/ai/new": {
          const sess = await registry.new();
          return yamlRes({ sessionId: sess.id });
        }

        case "/ai/resume": {
          const id = String(body.id ?? "");
          if (!id) return errRes(400, "bad_request", "id missing");
          const sess = await registry.resume(id);
          if (!sess) return errRes(404, "not_found", "session not found");
          return yamlRes({
            sessionId: sess.id,
            lastSeq: sess.events.length,
            active: sess.active,
          });
        }

        case "/ai/ask": {
          const blocks = (Array.isArray(body.blocks) ? body.blocks : [])
            .map((b: any): IncomingBlock | undefined => {
              if (b?.type === "text" && typeof b.text === "string") {
                return { type: "text", text: b.text };
              }
              if (
                b?.type === "image" &&
                typeof b.data === "string" &&
                typeof b.mimeType === "string"
              ) {
                return { type: "image", data: b.data, mimeType: b.mimeType };
              }
              return undefined;
            })
            .filter((b: IncomingBlock | undefined): b is IncomingBlock => !!b);
          if (!blocks.length) {
            return errRes(400, "bad_request", "blocks required");
          }
          const sess = registry.get(String(body.id ?? ""));
          if (!sess) return errRes(404, "not_found", "session not found");
          registry.ask(sess, blocks);
          return yamlRes({ sessionId: sess.id });
        }

        case "/ai/stop": {
          const sess = registry.get(String(body.id ?? ""));
          if (!sess) return errRes(404, "not_found", "session not found");
          try {
            await registry.stop(sess);
          } catch (err) {
            return errRes(500, "ai_error", String(err));
          }
          return yamlRes({ sessionId: sess.id });
        }

        case "/ai/stream": {
          const sess = registry.get(String(body.id ?? ""));
          if (!sess) return errRes(404, "not_found", "session not found");
          const since = Number(body.since) || 0;
          let listener: ((ev: EngineerEvent) => void) | undefined;
          let closed = false;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              const close = () => {
                if (closed) return;
                closed = true;
                if (listener) registry.unsubscribe(sess, listener);
                try {
                  controller.close();
                } catch {
                  // stream already closed
                }
              };
              listener = (ev) => {
                controller.enqueue(encodeSSE(ev));
                // agent_settled is pi's real end-of-run marker; close the SSE
                // stream on it. agent_end is unreliable (fires on retries).
                if (ev.type === "agent_settled") close();
              };
              // Replay only events the client has not rendered yet; since=0
              // (or omitted) replays the full backlog.
              const backlog = registry
                .subscribe(sess, listener)
                .filter((ev) => ev.seq > since);
              for (const ev of backlog) controller.enqueue(encodeSSE(ev));
              // Caught up and idle: nothing live will arrive until a new ask
              // starts a run (which opens its own stream). Close now instead of
              // holding the connection open.
              const lastSent = backlog.length
                ? backlog[backlog.length - 1].seq
                : since;
              if (!sess.active && sess.events.length <= lastSent) close();
            },
            cancel() {
              if (listener) registry.unsubscribe(sess, listener);
            },
          });
          return new Response(stream, {
            headers: {
              ...CORS,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        }

        case "/ai/delete": {
          const id = String(body.id ?? "");
          if (!id) return errRes(400, "bad_request", "bad request");
          if (!registry.delete(id)) {
            return errRes(404, "not_found", "session not found");
          }
          return yamlRes({ sessionId: id });
        }

        case "/ai/skill/list": {
          const filter: SkillFilter = {};
          const source = String(body.source ?? "");
          const status = String(body.status ?? "");
          if (source) {
            if (source !== "custom" && source !== "suggested") {
              return errRes(400, "bad_request", "unknown source filter");
            }
            filter.source = source;
          }
          if (status) {
            if (status !== "active" && status !== "ignored") {
              return errRes(400, "bad_request", "unknown status filter");
            }
            filter.status = status;
          }
          return yamlRes({ skills: registry.skills.list(filter).map(skillWire) });
        }

        case "/ai/skill/save": {
          const name = String(body.name ?? "").trim();
          const text = String(body.text ?? "").trim();
          if (!name || !text) {
            return errRes(400, "bad_request", "name and text required");
          }
          const id =
            body.id === undefined || body.id === null || body.id === ""
              ? undefined
              : String(body.id);
          const skill = registry.skills.save({ id, name, text });
          if (!skill) return errRes(404, "not_found", "skill not found");
          return yamlRes({ skill: skillWire(skill) });
        }

        case "/ai/skill/delete": {
          const id = String(body.id ?? "");
          if (!id) return errRes(400, "bad_request", "id missing");
          if (!registry.skills.remove(id)) {
            return errRes(404, "not_found", "skill not found");
          }
          return yamlRes({ skillId: id });
        }

        case "/ai/skill/ignore": {
          const id = String(body.id ?? "");
          if (!id) return errRes(400, "bad_request", "id missing");
          const ignored = !(body.ignored === false || body.ignored === "false");
          const skill = registry.skills.setIgnored(id, ignored);
          if (!skill) return errRes(404, "not_found", "skill not found");
          return yamlRes({ skill: skillWire(skill) });
        }

        case "/ai/skill/run": {
          const skillId = String(body.skillId ?? "");
          let text = String(body.text ?? "").trim();
          if (skillId) {
            const skill = registry.skills.get(skillId);
            if (!skill) return errRes(404, "not_found", "skill not found");
            text = skill.text;
          } else if (!text) {
            return errRes(400, "bad_request", "skillId or text required");
          }
          const sess = await registry.new();
          registry.ask(sess, [{ type: "text", text }]);
          registry.skills.linkSession(sess.id, skillId || undefined);
          return yamlRes(
            skillId ? { sessionId: sess.id, skillId } : { sessionId: sess.id },
          );
        }

        case "/ai/skill/refresh": {
          return yamlRes(await registry.scanSkills(true));
        }

        // --- blueprints: the classes behind pages ---
        //
        // No discovery and no filters: a blueprint is a directory, so the
        // listing *is* the set. The agent writes them through save_blueprint,
        // which goes through the same store.

        case "/ai/blueprint/list": {
          return yamlRes({
            blueprints: registry.blueprints.list().map(blueprintWire),
          });
        }

        case "/ai/blueprint/save": {
          const name = String(body.name ?? "").trim();
          const id =
            body.id === undefined || body.id === null || body.id === ""
              ? undefined
              : String(body.id);
          const files = (Array.isArray(body.files) ? body.files : []).map(
            (f: any) => ({
              path: String(f?.path ?? ""),
              content: String(f?.content ?? ""),
            }),
          );
          try {
            const bp = registry.blueprints.save({ id, name, files });
            return yamlRes({ blueprint: blueprintWire(bp) });
          } catch (err) {
            if (err instanceof BlueprintError) {
              return errRes(err.code === "not_found" ? 404 : 400, err.code, err.message);
            }
            throw err;
          }
        }

        case "/ai/blueprint/delete": {
          const id = String(body.id ?? "");
          if (!id) return errRes(400, "bad_request", "id missing");
          if (!registry.blueprints.remove(id)) {
            return errRes(404, "not_found", "blueprint not found");
          }
          return yamlRes({ blueprintId: id });
        }

        default:
          return errRes(404, "not_found", "unknown endpoint");
      }
    },
  });

  console.log(`engineer ai: serving on ${addr}`);
}
