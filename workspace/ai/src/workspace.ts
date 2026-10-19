// The main agent's workspace tools. main is the one conversation the shell
// itself hosts; everything it can do to the workspace — see the sessions, open
// and close tabs, rewrite a tab's panes, delete a tab and its agents — is a tool
// here. A blueprint agent (sub) gets none of these: its page is a view, not a
// workspace.
//
// The tools never talk to the frontend. They write log (sessions, tabs, current)
// and return; the shell runs main's stream itself, so the tool frame is what makes
// it redraw. One source of truth, one direction.

import { randomBytes } from "node:crypto";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import YAML from "yaml";
import { describeLayout, normalizeLayout, type PaneNode } from "./layout.ts";

export interface WorkspaceDeps {
  root: string;
  logBase: string;
  // The session these tools run inside — main itself. session-delete refuses it:
  // the conversation you are talking in is not yours to delete.
  selfId: string;
  // Open a new conversation from a blueprint slug (the session row is written by
  // the registry); returns its id.
  newSession: (blueprint?: string) => Promise<string>;
  // Rebuild a session server-side so it can be asked again.
  resumeSession: (id: string) => Promise<{ id: string; kind: string } | undefined>;
  // Hard delete: dispose the live session, delete its records, delete its copy.
  deleteSession: (id: string) => Promise<void>;
  // Whether a session id is real (live, or has recorded history).
  hasSession: (id: string) => Promise<boolean>;
}

async function logCall<T = any>(
  logBase: string,
  path: string,
  body: unknown = {},
): Promise<T> {
  const res = await fetch(`${logBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: YAML.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      message = YAML.parse(text)?.error?.message ?? message;
    } catch {
      // keep the status
    }
    throw new Error(`${path}: ${message}`);
  }
  return (text ? YAML.parse(text) : {}) as T;
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

function newPaneId(): string {
  return `p_${randomBytes(4).toString("hex")}`;
}

// One line per pane, for describing a stored tree back to the model.
function paneIdsOf(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (node.pane) {
    if (node.pane.paneId) out.push(String(node.pane.paneId));
    return out;
  }
  for (const child of node.split?.children ?? []) paneIdsOf(child, out);
  return out;
}

function contentIdsOf(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (node.pane) {
    const id = node.pane.contentId ?? node.pane.id ?? node.pane.content;
    if (id) out.push(String(id));
    return out;
  }
  for (const child of node.split?.children ?? []) contentIdsOf(child, out);
  return out;
}

function oneLine(s: unknown, max = 100): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function makeWorkspaceTools(deps: WorkspaceDeps) {
  const sessionList = defineTool({
    name: "session-list",
    label: "List sessions",
    description:
      "List this project's conversation sessions, most recent first: sessionId, kind " +
      "(main / sub), message count, last activity and a preview. Use it to find a " +
      "session before tab-on with an existing sessionId, or before session-resume.",
    promptSnippet: "session-list: list conversations in this project",
    parameters: Type.Object({}),
    execute: async () => {
      const data = await logCall(deps.logBase, "/log/list", { pageNum: 1 });
      const sessions = data.sessions ?? [];
      if (!sessions.length) return ok("No sessions in this project yet.");
      const lines = sessions.map(
        (s: any) =>
          `${s.sessionId}  ${s.kind ?? "sub"}  ${s.count} msgs  ${s.lastAt}  ${oneLine(s.preview)}`,
      );
      return ok(lines.join("\n"), { sessions });
    },
  });

  const sessionResume = defineTool({
    name: "session-resume",
    label: "Resume session",
    description:
      "Rebuild a conversation server-side from its records so it can be asked " +
      "again (a process restart, or a tab whose agent is no longer live). The " +
      "agent's own page resumes itself when it loads, so this is for sessions " +
      "nothing is currently showing.",
    promptSnippet: "session-resume: rebuild a conversation so it can be asked again",
    parameters: Type.Object({
      sessionId: Type.String({ description: "the conversation to resume" }),
    }),
    execute: async (_id, params) => {
      const sess = await deps.resumeSession(params.sessionId);
      if (!sess) {
        return fail(
          `No session ${params.sessionId}: it is neither live nor recorded in log.`,
        );
      }
      return ok(`Resumed ${sess.id} (${sess.kind}).`, { sessionId: sess.id, kind: sess.kind });
    },
  });

  const tabList = defineTool({
    name: "tab-list",
    label: "List tabs",
    description:
      "The workspace as it is right now: which session the shell's own chat is " +
      "(main), every open tab with its pane tree (paneId, the agent each pane " +
      "shows, flex), and the closed tabs whose records still exist. Read this " +
      "before tab-mutation — a write replaces the whole tree, so anything not in " +
      "it closes. A closed tab can be deleted with tab-delete (or shown again " +
      "with tab-on { sessionId }).",
    promptSnippet: "tab-list: the open tabs and their pane trees",
    parameters: Type.Object({}),
    execute: async () => {
      const current = await logCall(deps.logBase, "/log/current/get", {});
      const tabs = [];
      for (const tabId of current.openTabs ?? []) {
        try {
          const tab = await logCall(deps.logBase, "/log/tab/detail", { tabId });
          const layout = tab.layout ?? {};
          const empty = !layout.pane && !layout.split;
          tabs.push({
            tabId,
            panes: empty ? [] : contentIdsOf(layout),
            tree: empty ? "(no pane tree yet)" : describeLayout(layout as PaneNode),
          });
        } catch {
          // A tab id in current with no record: report it so it can be deleted.
          tabs.push({ tabId, panes: [], tree: "(record missing)" });
        }
      }
      // Closed tabs: their records still exist, so they can be reopened or
      // deleted. Without this they would be unreachable once tab-off hid them.
      const closed = [];
      try {
        const list = await logCall(deps.logBase, "/log/tab/list", { pageNum: 1 });
        const open = new Set((current.openTabs ?? []) as string[]);
        for (const rec of list.tabs ?? []) {
          if (open.has(rec.tabId)) continue;
          closed.push({
            tabId: rec.tabId,
            agents: contentIdsOf(rec.layout ?? {}),
          });
        }
      } catch {
        // The list is best-effort: the open tabs above are the important part.
      }
      const lines = [
        `main session: ${current.mainSession || "(none)"}`,
        ...tabs.map(
          (t) => `tab ${t.tabId}  agents: ${t.panes.join(", ") || "(none)"}\n${t.tree}`,
        ),
        ...(closed.length
          ? [
              "closed tabs (record kept):\n" +
                closed
                  .map((t) => `tab ${t.tabId}  agents: ${t.agents.join(", ") || "(none)"}`)
                  .join("\n"),
            ]
          : []),
      ];
      return ok(lines.join("\n\n"), { mainSession: current.mainSession, tabs, closed });
    },
  });

  const tabMutation = defineTool({
    name: "tab-mutation",
    label: "Rewrite a tab's layout",
    description:
      "Replace one tab's pane tree. The tree is the whole layout — a write drops " +
      "every pane not in it — so read tab-list first and pass back the paneIds you " +
      "mean to keep. A leaf is { pane: { paneId, contentId, flex? } } (contentId is " +
      "a sessionId), or { pane: { blueprint: \"<slug>\" } } to instantiate a new " +
      "agent into that pane; a split is { split: { flexDirection: \"row\" | " +
      "\"column\", flex?, children: [ … ] } }. At most 6 panes.",
    promptSnippet: "tab-mutation: replace a tab's pane tree",
    parameters: Type.Object({
      tabId: Type.String({ description: "the tab to rewrite" }),
      layout: Type.Any({ description: "the whole pane tree" }),
    }),
    execute: async (_id, params) => {
      let stored;
      try {
        stored = await logCall(deps.logBase, "/log/tab/detail", { tabId: params.tabId });
      } catch (err) {
        return fail(`No tab ${params.tabId}: ${String((err as Error).message)}`);
      }
      const currentLayout = stored.layout ?? {};
      try {
        const layout = await normalizeLayout(params.layout, {
          newSession: deps.newSession,
          hasSession: deps.hasSession,
          currentIds: contentIdsOf(currentLayout),
          currentPaneIds: paneIdsOf(currentLayout),
        });
        const saved = await logCall(deps.logBase, "/log/tab/mutation", {
          tabId: params.tabId,
          layout,
        });
        return ok(
          `Layout applied to tab ${params.tabId}:\n${describeLayout(saved.layout ?? layout)}`,
          { tabId: params.tabId, layout: saved.layout ?? layout },
        );
      } catch (err) {
        return fail(
          `Layout rejected: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  });

  const tabOn = defineTool({
    name: "tab-on",
    label: "Open a tab",
    description:
      "Open a new tab showing one agent. Pass `blueprint` to instantiate a fresh " +
      "agent from that blueprint (the normal way to put something new on screen), " +
      "or `sessionId` to show an existing conversation. The tab opens with a " +
      "single pane; use tab-mutation to split it.",
    promptSnippet: "tab-on: open a tab for a new or existing agent",
    parameters: Type.Object({
      blueprint: Type.Optional(
        Type.String({ description: "blueprint slug to instantiate a new agent from" }),
      ),
      sessionId: Type.Optional(
        Type.String({ description: "an existing conversation to show instead" }),
      ),
    }),
    execute: async (_id, params) => {
      let sessionId = params.sessionId?.trim() ?? "";
      if (sessionId) {
        if (!(await deps.hasSession(sessionId))) {
          return fail(`No session ${sessionId}: neither live nor recorded in log.`);
        }
      } else if (params.blueprint?.trim()) {
        try {
          sessionId = await deps.newSession(params.blueprint.trim());
        } catch (err) {
          return fail(
            `Could not instantiate ${params.blueprint}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      } else {
        return fail("tab-on needs `blueprint` (a new agent) or `sessionId` (an existing one).");
      }
      try {
        const tab = await logCall(deps.logBase, "/log/tab/new", {});
        const layout = { pane: { paneId: newPaneId(), contentId: sessionId } };
        const saved = await logCall(deps.logBase, "/log/tab/mutation", {
          tabId: tab.tabId,
          layout,
        });
        return ok(`Opened tab ${saved.tabId} with agent ${sessionId}.`, {
          tabId: saved.tabId,
          sessionId,
          layout,
        });
      } catch (err) {
        return fail(`Could not open the tab: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  const tabOff = defineTool({
    name: "tab-off",
    label: "Close a tab",
    description:
      "Close a tab: it leaves the workspace, but its record and its agent stay — " +
      "use tab-delete to remove them for good.",
    promptSnippet: "tab-off: close a tab, keeping its record",
    parameters: Type.Object({ tabId: Type.String({ description: "the tab to close" }) }),
    execute: async (_id, params) => {
      try {
        await logCall(deps.logBase, "/log/tab/off", { tabId: params.tabId });
        return ok(`Closed tab ${params.tabId}.`);
      } catch (err) {
        return fail(`Could not close the tab: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  const tabDelete = defineTool({
    name: "tab-delete",
    label: "Delete a tab",
    description:
      "Delete a tab and every agent it showed: the tab record, each conversation's " +
      "records, and each agent's copy of its blueprint. This cannot be undone.",
    promptSnippet: "tab-delete: delete a tab and its agents",
    parameters: Type.Object({ tabId: Type.String({ description: "the tab to delete" }) }),
    execute: async (_id, params) => {
      let stored;
      try {
        stored = await logCall(deps.logBase, "/log/tab/detail", { tabId: params.tabId });
      } catch {
        return fail(`No tab ${params.tabId}.`);
      }
      const deleted: string[] = [];
      for (const sessionId of new Set(contentIdsOf(stored.layout ?? {}))) {
        await deps.deleteSession(sessionId);
        deleted.push(sessionId);
      }
      try {
        await logCall(deps.logBase, "/log/tab/delete", { tabId: params.tabId });
      } catch (err) {
        return fail(`Deleted its agents, but not the tab: ${
          err instanceof Error ? err.message : String(err)
        }`);
      }
      return ok(
        `Deleted tab ${params.tabId}${deleted.length ? ` and agent(s) ${deleted.join(", ")}` : ""}.`,
        { tabId: params.tabId, sessions: deleted },
      );
    },
  });

  const sessionDelete = defineTool({
    name: "session-delete",
    label: "Delete a conversation",
    description:
      "Delete one conversation for good: the live agent, its records in log, and " +
      "its copy of its blueprint. This cannot be undone. It refuses only one id — " +
      "the conversation you are talking in (main). It does not touch tabs: a tab " +
      "still showing the deleted agent keeps a dead pane and its page is gone, so " +
      "when the tab should go too, use tab-delete instead. To make an agent leave " +
      "the screen without deleting it, use tab-off.",
    promptSnippet: "session-delete: delete one conversation for good (never yourself)",
    parameters: Type.Object({
      sessionId: Type.String({ description: "the conversation to delete" }),
    }),
    execute: async (_id, params) => {
      const id = String(params.sessionId ?? "").trim();
      if (!id) return fail("session-delete needs a sessionId.");
      if (id === deps.selfId) {
        return fail(
          `That is this conversation (${id}, main): it cannot delete itself. ` +
            "Delete another agent's session, or tab-delete a whole tab.",
        );
      }
      // log/delete answers 200 with deleted: 0 for an id that never existed, so
      // a typo would otherwise read as success. Look first.
      if (!(await deps.hasSession(id))) {
        return fail(`No session ${id}: it is neither live, recorded in log, nor an instantiated agent.`);
      }
      try {
        await deps.deleteSession(id);
      } catch (err) {
        return fail(`Could not delete ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return ok(`Deleted ${id} for good: agent, records and blueprint copy.`, {
        sessionId: id,
      });
    },
  });

  return [
    sessionList,
    sessionResume,
    sessionDelete,
    tabList,
    tabMutation,
    tabOn,
    tabOff,
    tabDelete,
  ];
}
