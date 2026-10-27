// The model tool: what pi can use right now, and switching this conversation's
// model. It is every session's tool (main and sub alike) and it never talks to
// the frontend — a switch is pi's own `setModel`, so nothing is written to pi's
// settings and no other conversation is touched.
//
// pi stays the only source of model config: the list is what its own catalog +
// auth make available, and a session with no explicit choice runs whatever pi
// resolved from its settings. This tool overrides that for one live session
// only; after a restart the conversation resumes on pi's default again, because
// history is rebuilt from log records and a pi model-change entry is not one.

import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";

export interface ModelToolDeps {
  // pi's runtime: the model catalog + which providers have credentials. Absent
  // only in stub mode (--stub, or no provider authenticated at all).
  runtime?: ModelRuntime;
  // This session's agent. It is undefined for the same reason: a stub session
  // has no pi session behind it, so there is nothing to switch.
  getAgent: () => AgentSession | undefined;
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
      "pi's models, and this conversation's model. `list` shows every model pi " +
      "can use right now (only providers it has credentials for) and marks the " +
      "one this session runs; `set` switches this session to one of them by " +
      "provider/model-id. `set` overrides pi's configured default for this " +
      "conversation only — it writes nothing to pi's settings and leaves every " +
      "other conversation alone. Use it when the user asks which model is " +
      "running or asks to switch; do not switch on your own initiative.",
    promptSnippet: "model: list pi's available models, or switch this session's model",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("set")], {
        description: "list, or set",
      }),
      model: Type.Optional(
        Type.String({ description: "provider/model-id to switch to (set only), from list" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
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
            : "current: (pi's default; this session has no agent yet)",
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

      const wanted = String(params.model ?? "").trim();
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
        // pi refuses when the provider has no credentials; say it as it is.
        return fail(`pi refused the switch: ${String(err)}`);
      }
      return ok(
        `switched to ${ref(target)} (thinking ${agent.thinkingLevel}). This ` +
          `conversation only: pi's settings still say what they said, and other ` +
          `conversations are untouched.`,
        { model: ref(target), thinkingLevel: agent.thinkingLevel },
      );
    },
  });
}
