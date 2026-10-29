// The model tool: what pi can use right now, and which model this conversation
// runs. It is every session's tool (main and sub alike) and it never talks to the
// frontend — a chat switch is pi's own `setModel`, so nothing is written to pi's
// settings and no other conversation is touched.
//
// Two slots, two kinds of switch:
//
// - chat: a live switch, `agent.setModel` on the running session. The default it
//   overrides is the role's `chat` in the engineer home's models.yaml (or the
//   model the conversation was created with).
// - image: a switch only records the choice in the session row's `imageModel` —
//   the `image` tool reads it at call time, so an image switch takes effect on
//   the next generation rather than on a session rebuild.
//
// pi stays the source of the chat catalog and the credentials: the list is what
// its catalog + auth make available. What makes a switch survive a restart is the
// session row — the one place a conversation's model choice lives. Nothing is
// written into the conversation's own records, so a rebuild has a single answer
// to read and no older one to disagree with it.
//
// The thinking level is not part of any of this. A switch does not snapshot
// `agent.thinkingLevel` and a rebuild does not pass one: pi derives it per model
// from its own settings, which is the same rule it applied at switch time.

import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { isModelRef } from "./models-config.ts";

export interface ModelToolDeps {
  // pi's runtime: the chat model catalog + which providers have credentials.
  // Absent only in stub mode (--stub, or no provider authenticated at all).
  runtime?: ModelRuntime;
  // This session's agent. It is undefined for the same reason: a stub session
  // has no pi session behind it, so there is nothing to switch.
  getAgent: () => AgentSession | undefined;
  // The image model this conversation is on (resolved at build), for `list`.
  getImageModel?: () => string | undefined;
  // persist records the choice on the session row, which is what a resumed
  // session is rebuilt from. Absent only where there is nothing to persist into.
  persist?: (choice: { slot: "chat" | "image"; model: string }) => void;
}

// ref is how a model is named everywhere: provider/model-id, the same string
// pi's own CLI accepts.
function ref(m: any): string {
  return `${m.provider}/${m.id}`;
}

function size(n: unknown): string | undefined {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(v);
}

// describe renders one catalog entry: what it is called, how much it holds, and
// the two capabilities that change how a turn behaves.
function describe(m: any): string {
  const bits: string[] = [];
  if (m.name && m.name !== m.id) bits.push(String(m.name));
  const ctx = size(m.contextWindow);
  if (ctx) bits.push(`ctx ${ctx}`);
  const out = size(m.maxTokens);
  if (out) bits.push(`out ${out}`);
  if (Array.isArray(m.input) && m.input.includes("image")) bits.push("vision");
  if (m.reasoning) bits.push("reasoning");
  return bits.length ? `${ref(m)} — ${bits.join(", ")}` : ref(m);
}

function ok(text: string, details: unknown = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function fail(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { error: text },
    isError: true,
  };
}

export function makeModelTool(deps: ModelToolDeps) {
  return defineTool({
    name: "model",
    label: "Model",
    description:
      "pi's models, and this conversation's model. `list` shows every chat model pi " +
      "can use right now (only providers it has credentials for) and marks the " +
      "one this session runs; `set` switches this session's chat model to one of " +
      "them by provider/model-id. `slot: image` addresses the image-generation " +
      "model the `image` tool runs on instead: `set` records it with this " +
      "conversation, `list` reports it. A chat switch overrides the configured " +
      "`chat` default (the " +
      "engineer home's models.yaml) for this conversation only — it writes " +
      "nothing to pi's settings and leaves every other conversation alone; the " +
      "choice is recorded with this conversation, so it is still the one it runs " +
      "after a restart. Use it when the user asks which model is running or asks " +
      "to switch; do not switch on your own initiative.",
    promptSnippet:
      "model: list pi's available chat models, or switch this session's chat / image model",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("set")], {
        description: "list, or set",
      }),
      model: Type.Optional(
        Type.String({ description: "provider/model-id to switch to (set only), from list" }),
      ),
      slot: Type.Optional(
        Type.Union([Type.Literal("chat"), Type.Literal("image")], {
          description: "which model to list or switch: chat (default) or image",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const slot = params.slot === "image" ? "image" : "chat";
      const wanted = String(params.model ?? "").trim();

      if (slot === "image") {
        if (params.action === "list") {
          const current = deps.getImageModel?.() ?? "";
          const lines = [
            current ? `current: ${current}` : "current: (none)",
            "this is the model the `image` tool generates with; the role default " +
              "is `image` in models.yaml.",
            "`set` with slot=image records a provider/model-id for this conversation.",
          ];
          return ok(lines.join("\n"), { slot, current });
        }
        if (!wanted) return fail("set needs a model, e.g. provider/model-id");
        if (!isModelRef(wanted)) {
          return fail(`not a provider/model-id: ${wanted}`);
        }
        deps.persist?.({ slot: "image", model: wanted });
        return ok(
          `recorded image model ${wanted} for this conversation; the \`image\` tool ` +
            `generates with it from the next call on, and the choice survives a restart.`,
          { slot, model: wanted },
        );
      }

      if (!deps.runtime) return fail("no model runtime: this session runs in stub mode (--stub)");
      let available: readonly any[];
      try {
        available = await deps.runtime.getAvailable();
      } catch (err) {
        return fail(`could not read pi's models: ${String(err)}`);
      }
      if (!available.length) {
        return fail("pi has no available model (no authenticated provider in its config)");
      }
      const agent = deps.getAgent();
      const current = agent?.model;

      if (params.action === "list") {
        const byProvider = new Map<string, any[]>();
        for (const m of available) {
          const list = byProvider.get(m.provider) ?? [];
          list.push(m);
          byProvider.set(m.provider, list);
        }
        const lines: string[] = [];
        lines.push(
          current
            ? `current: ${ref(current)} (thinking ${agent?.thinkingLevel ?? "?"})`
            : "current: (this session has no agent yet)",
        );
        for (const [provider, models] of byProvider) {
          lines.push(`${provider}:`);
          for (const m of models) {
            const mark = current && ref(current) === ref(m) ? "  ← current" : "";
            lines.push(`  ${describe(m)}${mark}`);
          }
        }
        lines.push(`${available.length} model(s) from pi's config.`);
        return ok(lines.join("\n"), {
          slot,
          current: current ? ref(current) : "",
          thinkingLevel: agent?.thinkingLevel ?? "",
          models: available.map((m) => ({
            ref: ref(m),
            provider: m.provider,
            id: m.id,
            name: m.name,
            contextWindow: m.contextWindow,
            maxTokens: m.maxTokens,
            reasoning: !!m.reasoning,
            vision: Array.isArray(m.input) && m.input.includes("image"),
          })),
        });
      }

      if (!wanted) return fail("set needs a model, e.g. provider/model-id from list");
      let target = available.find((m) => ref(m) === wanted);
      if (!target) {
        // A bare id is accepted when it names exactly one model.
        const byId = available.filter((m) => m.id === wanted);
        if (byId.length > 1) {
          return fail(`ambiguous: ${byId.map(ref).join(", ")}`);
        }
        target = byId[0];
      }
      if (!target) {
        return fail(`no such model: ${wanted} (pi has ${available.length} available; call list)`);
      }
      if (!agent) return fail("this session has no agent to switch (stub mode)");
      try {
        await agent.setModel(target);
      } catch (err) {
        // pi refused when the provider has no credentials; say it as it is.
        return fail(`pi refused the switch: ${String(err)}`);
      }
      deps.persist?.({ slot: "chat", model: ref(target) });
      return ok(
        `switched to ${ref(target)} (thinking ${agent.thinkingLevel}). This ` +
          `conversation only: the configured default in models.yaml still says what it ` +
          `says, and other conversations are untouched. The choice is recorded with ` +
          `this conversation, so it is still the model after a restart.`,
        { slot, model: ref(target), thinkingLevel: agent.thinkingLevel },
      );
    },
  });
}
