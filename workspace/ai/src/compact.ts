// The compact tool: fold this conversation's older messages into a summary, so
// the next turn starts from the summary instead of the whole history.
//
// It is a tool rather than a slash command on purpose (this host has no command
// layer): the user says "compact this" in words and the model calls it. pi still
// owns automatic compaction — this only adds the manual trigger.
//
// The one thing that matters here is *when* it runs. pi's `session.compact()`
// begins with `await abort()` → `await waitForIdle()`: called from inside a tool
// it would wait for the very run that is blocked on this tool, and the session
// would hang. So the tool only *schedules* the work on the registry's per-session
// tail and returns; the compaction then runs between this turn and the next one,
// with the agent idle. Its `compaction_end` event reaches the same subscription
// that records every other entry, so the summary is persisted without this file
// touching the log at all.

import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export interface CompactToolDeps {
  // Undefined only for a stub session: nothing to compact.
  getAgent: () => AgentSession | undefined;
  // schedule appends work after the current turn (registry: sess.tail). It must
  // swallow its own errors — a rejected tail would skip every later turn.
  schedule: (run: () => Promise<void>) => void;
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

export function makeCompactTool(deps: CompactToolDeps) {
  // One compaction in flight at a time: two scheduled runs would summarize the
  // same history twice, and the second would arrive with nothing left to do.
  let scheduled = false;

  return defineTool({
    name: "compact",
    label: "Compact",
    description:
      "Compact this conversation: summarize the older messages and continue from " +
      "the summary, freeing context. pi already compacts automatically near the " +
      "context limit — call this only when the user asks to compact (or asks for " +
      "the context to be freed). It runs right after the current turn ends, so " +
      "this turn still finishes normally; the next turn starts from the summary. " +
      "Optional `instructions` say what the summary must keep.",
    promptSnippet: "compact: summarize older messages and continue from the summary",
    parameters: Type.Object({
      instructions: Type.Optional(
        Type.String({
          description: "what the summary must preserve, e.g. decisions or file paths (optional)",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const agent = deps.getAgent();
      if (!agent) return fail("this session has no agent (stub mode); nothing to compact");
      if (scheduled) {
        return fail("a compaction is already scheduled and runs when this turn ends");
      }
      const ctx = agent.getContextUsage();
      const before =
        ctx && typeof ctx.tokens === "number"
          ? ` (context now ~${Math.round(ctx.tokens / 1000)}k tokens)`
          : "";
      const instructions = String(params.instructions ?? "").trim() || undefined;

      scheduled = true;
      deps.schedule(async () => {
        try {
          await agent.compact(instructions);
        } finally {
          scheduled = false;
        }
      });

      return ok(
        `compaction scheduled${before}. It runs as soon as this turn ends — this ` +
          "reply is unaffected — and the next turn starts from the summary instead " +
          "of the full history. A `compaction_end` event marks it on the stream.",
        { scheduled: true, tokensBefore: ctx?.tokens ?? null, instructions: instructions ?? "" },
      );
    },
  });
}
