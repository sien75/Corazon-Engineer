// The usage tool: how full this conversation's context is, and what it has cost
// so far. Read-only — it reports numbers pi already tracks (getContextUsage)
// and aggregates from pi's own session entries (getSessionStats), nothing is
// mutated and nothing is persisted.
//
// It is a tool rather than a page control on purpose: "how much room is left"
// is a question the user asks in words, and the answer belongs in the
// conversation it describes.

import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export interface UsageToolDeps {
  // Undefined only for a stub session (--stub, or no provider authenticated):
  // there is no pi session behind it, so there is nothing to measure.
  getAgent: () => AgentSession | undefined;
}

// size renders a token count the way people read them: 12.4k / 1.2M.
function size(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "?";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 >= 100_000 ? 1 : 2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 >= 100 ? 1 : 2)}k`;
  return String(Math.round(v));
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

export function makeUsageTool(deps: UsageToolDeps) {
  return defineTool({
    name: "usage",
    label: "Usage",
    description:
      "This conversation's context usage and cost: how many tokens the context " +
      "holds against the model's window, how much has been billed, and when it " +
      "was last compacted. Read-only. Use it when the user asks how full the " +
      "context is, how much the conversation has cost, or whether it is time to " +
      "compact — pi compacts automatically near the limit, so this is a report, " +
      "not a trigger.",
    promptSnippet: "usage: context usage and cost of this conversation (read-only)",
    parameters: Type.Object({}),
    execute: async () => {
      const agent = deps.getAgent();
      if (!agent) return fail("this session has no agent (stub mode); nothing to measure");

      let stats: ReturnType<AgentSession["getSessionStats"]> | undefined;
      try {
        stats = agent.getSessionStats();
      } catch (err) {
        return fail(`could not read pi's session stats: ${String(err)}`);
      }
      const ctx = agent.getContextUsage() ?? stats?.contextUsage;
      const model = agent.model;
      const tokens = stats?.tokens;
      const lines: string[] = [];

      lines.push(
        model
          ? `model: ${model.provider}/${model.id} (thinking ${agent.thinkingLevel})`
          : "model: (pi has not resolved one yet)",
      );

      if (ctx && Number.isFinite(ctx.contextWindow) && ctx.contextWindow > 0) {
        if (ctx.tokens === null) {
          lines.push(
            `context: ? / ${size(ctx.contextWindow)} tokens (will settle after the next reply)`,
          );
        } else {
          const left = Math.max(0, ctx.contextWindow - ctx.tokens);
          const pct = ctx.percent === null ? "" : ` (${ctx.percent.toFixed(1)}%)`;
          lines.push(
            `context: ${size(ctx.tokens)} / ${size(ctx.contextWindow)} tokens${pct}, ` +
              `${size(left)} left`,
          );
        }
        lines.push("  pi compacts on its own near the limit; use `compact` only when asked.");
      } else {
        lines.push("context: unknown (pi reports no usage for this model yet)");
      }

      if (stats) {
        lines.push(
          `conversation: ${stats.totalMessages} messages (${stats.userMessages} user, ` +
            `${stats.assistantMessages} assistant, ${stats.toolCalls} tool calls)`,
        );
      }
      if (tokens) {
        const cache = tokens.cacheRead || tokens.cacheWrite
          ? ` (cache read ${size(tokens.cacheRead)}, write ${size(tokens.cacheWrite)})`
          : "";
        lines.push(
          `billed: in ${size(tokens.input)}${cache}, out ${size(tokens.output)}, ` +
            `total ${size(tokens.total)} tokens`,
        );
      }
      if (typeof stats?.cost === "number") {
        lines.push(`cost: $${stats.cost.toFixed(4)}`);
      }

      // Latest compaction on the active branch, if any: what the summary replaced.
      // Two shapes count. Live, pi records a `compaction` entry; on resume the
      // summary comes back as an ordinary message (registry replays it as
      // `compactionSummary`), so a restarted conversation reports the same
      // number instead of claiming it was never compacted.
      let compactions = 0;
      let lastBefore: number | undefined;
      try {
        for (const entry of agent.sessionManager.getBranch()) {
          const e = entry as any;
          const isCompaction =
            e?.type === "compaction" || e?.message?.role === "compactionSummary";
          if (!isCompaction) continue;
          compactions++;
          lastBefore =
            Number(e.tokensBefore ?? e.message?.tokensBefore ?? 0) || undefined;
        }
      } catch {
        // A session manager without a readable branch is not an error worth a
        // failed tool call — the numbers above are already the answer.
      }
      lines.push(
        compactions
          ? `compactions: ${compactions} on this branch, the latest summarized ` +
              `${lastBefore ? size(lastBefore) : "an unknown number of"} tokens` +
              " (now carried as a summary)"
          : "compactions: none yet on this branch",
      );

      return ok(lines.join("\n"), {
        model: model ? `${model.provider}/${model.id}` : "",
        thinkingLevel: agent.thinkingLevel,
        tokens: ctx?.tokens ?? null,
        contextWindow: ctx?.contextWindow ?? null,
        percent: ctx?.percent ?? null,
        billed: tokens
          ? {
              input: tokens.input,
              output: tokens.output,
              cacheRead: tokens.cacheRead,
              cacheWrite: tokens.cacheWrite,
              total: tokens.total,
            }
          : null,
        cost: stats?.cost ?? null,
        compactions,
      });
    },
  });
}
