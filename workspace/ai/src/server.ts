import YAML from "yaml";
import type { Registry, CorazonEvent } from "./registry.ts";

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
// joins them back before parsing (per SSE spec).
function encodeSSE(ev: CorazonEvent): Uint8Array {
  const doc = YAML.stringify(ev).replace(/\n+$/, "");
  const payload =
    doc
      .split("\n")
      .map((l) => `data: ${l}`)
      .join("\n") + "\n\n";
  return new TextEncoder().encode(payload);
}

export function serve(registry: Registry, addr: string): void {
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
          return yamlRes({ sessionId: sess.id, lastSeq: sess.events.length });
        }

        case "/ai/ask": {
          const prompt = String(body.prompt ?? "");
          if (!prompt.trim()) {
            return errRes(400, "bad_request", "prompt missing or empty");
          }
          const sess = registry.get(String(body.id ?? ""));
          if (!sess) return errRes(404, "not_found", "session not found");
          registry.ask(sess, prompt);
          return yamlRes({ sessionId: sess.id });
        }

        case "/ai/answer": {
          const answer = String(body.answer ?? "");
          if (!answer.trim()) {
            return errRes(400, "bad_request", "answer missing or empty");
          }
          const sess = registry.get(String(body.id ?? ""));
          if (!sess) return errRes(404, "not_found", "session not found");
          registry.answer(sess, answer);
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
          let listener: ((ev: CorazonEvent) => void) | undefined;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              listener = (ev) => {
                controller.enqueue(encodeSSE(ev));
                // agent_settled is pi's real end-of-run marker; close the SSE
                // stream on it. agent_end is unreliable (fires on retries).
                if (ev.type === "agent_settled") {
                  registry.unsubscribe(sess, listener!);
                  controller.close();
                }
              };
              const backlog = registry.subscribe(sess, listener);
              for (const ev of backlog) controller.enqueue(encodeSSE(ev));
              // If the run already finished before we subscribed, its terminal
              // sits in the backlog: close now instead of waiting for a live
              // event that will never come.
              const last = backlog[backlog.length - 1];
              if (last && last.type === "agent_settled") {
                registry.unsubscribe(sess, listener);
                controller.close();
              }
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

        default:
          return errRes(404, "not_found", "unknown endpoint");
      }
    },
  });

  console.log(`corazon ai: serving on ${addr}`);
}
