// The main agent's workspace tools. main is the one conversation the shell
// itself hosts; everything it can do to the workspace — see what is open, open and
// close tabs, add and remove panes, delete a tab and the conversations it holds —
// is a tool here. A blueprint agent (sub) gets none of these: its page is a view,
// not a workspace.
//
// The tools never talk to the frontend. They write log (tabs, sessions, current)
// and return; the shell runs main's stream itself, so the tool frame is what makes
// it redraw. One source of truth, one direction.
//
// There is no session-level tool on purpose. A conversation is only reachable
// through the tab that holds it: opening the tab resumes it, deleting the tab
// deletes it. A conversation nothing shows is a record, not a thing on screen.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import YAML from "yaml";
import {
  addPane,
  contentIds,
  deletePane,
  describeLayout,
  MAX_PANES,
  paneCount,
  paneIds,
  type PaneLeaf,
  type PaneNode,
  type Side,
} from "./layout.ts";

export interface WorkspaceDeps {
  root: string;
  logBase: string;
  // The session these tools run inside — main itself.
  selfId: string;
  // Open a new conversation from a blueprint slug (the session row is written by
  // the registry, and so is its blueprint); returns its id.
  newSession: (blueprint: string) => Promise<string>;
  // The blueprint a conversation was made from; "" when it has none.
  sessionBlueprint: (id: string) => Promise<string>;
  // Hard delete: dispose the live session and delete its records. The page is the
  // blueprint's, shared with every other agent of it, so it stays.
  deleteSession: (id: string) => Promise<void>;
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

// ---------- titles ----------
//
// A tab is named after the pages it shows: each pane's blueprint index.html
// <title>, deduplicated and joined. The name is stored on the tab so the shell can
// draw a tab bar before anything is loaded, and recomputed on every layout change —
// a tab whose panes changed and whose name did not would be a lie.

const titleCache = new Map<string, string>();

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function blueprintTitle(root: string, slug: string): string {
  const cached = titleCache.get(slug);
  if (cached !== undefined) return cached;
  let title = "";
  try {
    const html = readFileSync(path.join(root, ".agents", "blueprints", slug, "index.html"), "utf8");
    const bare = html.replace(/<!--[\s\S]*?-->/g, "");
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(bare);
    title = m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
  } catch {
    title = "";
  }
  titleCache.set(slug, title);
  return title;
}

// tabTitle names a tab from the pages it shows, in pane order.
async function tabTitle(
  deps: WorkspaceDeps,
  layout: PaneNode,
): Promise<string> {
  const names: string[] = [];
  for (const contentId of contentIds(layout)) {
    let slug = "";
    try {
      slug = await deps.sessionBlueprint(contentId);
    } catch {
      slug = "";
    }
    const name = slug ? blueprintTitle(deps.root, slug) || slug : "";
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(" · ");
}

// oneLine shortens a text for a tool result.
function oneLine(s: unknown, max = 100): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function makeWorkspaceTools(deps: WorkspaceDeps) {
  const currentTabList = defineTool({
    name: "current-tab-list",
    label: "List open tabs",
    description:
      "What is on screen right now: the sessions of the shell's own chat (main) and " +
      "every open tab in display order, each with its tabId, its title, how many " +
      "panes it has and when it was last active. Tabs that are closed keep their " +
      "records and appear in the launcher, not here — reopen one with " +
      "current-tab-mutation { op: on }.",
    promptSnippet: "current-tab-list: the tabs currently open",
    parameters: Type.Object({}),
    execute: async () => {
      const current = await logCall(deps.logBase, "/log/current/get", {});
      const list = await logCall(deps.logBase, "/log/tab/list", { pageNum: 1 });
      const byId = new Map<string, any>();
      for (const rec of list.tabs ?? []) byId.set(rec.tabId, rec);
      const rows = [];
      const lines = [];
      for (const tabId of current.openTabs ?? []) {
        const rec = byId.get(tabId);
        if (!rec) {
          rows.push({ tabId, title: "", panes: 0, lastAt: "" });
          lines.push(`tab ${tabId}  (record missing)`);
          continue;
        }
        const panes = contentIds(rec.layout ?? {}).length;
        rows.push({ tabId, title: rec.title ?? "", panes, lastAt: rec.lastAt ?? "" });
        lines.push(
          `tab ${tabId}  ${oneLine(rec.title || "(untitled)", 40)}  ${panes} pane(s)  ${rec.lastAt ?? ""}`,
        );
      }
      const body = [
        `main: ${current.mainSession || "(none)"}`,
        rows.length ? lines.join("\n") : "no tabs open",
      ].join("\n");
      return ok(body, { mainSession: current.mainSession, tabs: rows });
    },
  });

  const currentTabMutation = defineTool({
    name: "current-tab-mutation",
    label: "Open / close tabs",
    description:
      "Change which tabs are open, in order. Each op takes tabIds, so one call can " +
      "open or close several. `on` puts a tab back in the workspace — the same " +
      "record, not a new one; opening a tab never creates anything, use tab-new for " +
      "that. `off` closes it and keeps its record. Both are idempotent: opening an " +
      "open tab keeps its place, closing a closed one does nothing.",
    promptSnippet: "current-tab-mutation: open or close tabs",
    parameters: Type.Object({
      ops: Type.Array(
        Type.Object({
          op: Type.String({ description: "on | off" }),
          tabIds: Type.Array(Type.String(), { description: "the tabs to open or close" }),
          index: Type.Optional(
            Type.Number({
              description: "where the first newly opened tab goes; omitted appends to the end",
            }),
          ),
        }),
        { description: "applied in order" },
      ),
    }),
    execute: async (_id, params) => {
      let openTabs: string[] = [];
      for (const raw of params.ops ?? []) {
        const op = String(raw.op ?? "").trim();
        const tabIds = (raw.tabIds ?? []).map((t: string) => String(t ?? "").trim()).filter(Boolean);
        if (!tabIds.length) return fail(`${op || "each op"} needs tabIds.`);
        try {
          if (op === "on") {
            const body = await logCall(deps.logBase, "/log/tab/on", {
              tabIds,
              ...(typeof raw.index === "number" ? { index: raw.index } : {}),
            });
            openTabs = body.openTabs ?? openTabs;
          } else if (op === "off") {
            const body = await logCall(deps.logBase, "/log/tab/off", { tabIds });
            openTabs = body.openTabs ?? openTabs;
          } else {
            return fail(`unknown op ${JSON.stringify(op)}: use "on" or "off".`);
          }
        } catch (err) {
          return fail(`Could not apply ${op}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return ok(
        openTabs.length ? `open tabs: ${openTabs.join(", ")}` : "no tabs open",
        { openTabs },
      );
    },
  });

  const tabNew = defineTool({
    name: "tab-new",
    label: "New tab",
    description:
      "Make a new agent from a blueprint and put it on screen in a tab of its own. " +
      "The session id is assigned here — you never pass one, and a conversation " +
      "cannot be moved into a new tab (it belongs to the tab that made it; reopen " +
      "that tab instead). The tab starts with one pane; use tab-layout-mutation to " +
      "split it.",
    promptSnippet: "tab-new: a new agent in a new tab",
    parameters: Type.Object({
      blueprint: Type.String({ description: "blueprint slug to instantiate" }),
      open: Type.Optional(
        Type.Boolean({ description: "put it in the open list too; default true" }),
      ),
    }),
    execute: async (_id, params) => {
      const slug = String(params.blueprint ?? "").trim();
      if (!slug) return fail("tab-new needs `blueprint`.");
      let sessionId = "";
      try {
        sessionId = await deps.newSession(slug);
      } catch (err) {
        return fail(
          `Could not instantiate ${slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const layout: PaneNode = { pane: { paneId: newPaneId(), contentId: sessionId } };
      try {
        const saved = await logCall(deps.logBase, "/log/tab/new", {
          title: await tabTitle(deps, layout),
          layout,
          sessionIds: [sessionId],
          open: params.open === undefined ? true : params.open,
        });
        return ok(
          `Tab ${saved.tabId} — ${saved.title || slug}, agent ${sessionId}.`,
          { tabId: saved.tabId, sessionId, title: saved.title ?? "", layout },
        );
      } catch (err) {
        // A tab that could not be written leaves the agent orphaned: drop it.
        try {
          await deps.deleteSession(sessionId);
        } catch {
          // the original error is what matters
        }
        return fail(`Could not create the tab: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  const tabDelete = defineTool({
    name: "tab-delete",
    label: "Delete a tab",
    description:
      "Delete a tab and everything it holds: the tab record, and each conversation " +
      "it showed (its agent and its records). This cannot be undone — the pages stay, " +
      "they belong to their blueprints. To take a tab off screen without deleting " +
      "it, use current-tab-mutation { op: off }.",
    promptSnippet: "tab-delete: delete a tab and its conversations",
    parameters: Type.Object({ tabId: Type.String({ description: "the tab to delete" }) }),
    execute: async (_id, params) => {
      let stored;
      try {
        stored = await logCall(deps.logBase, "/log/tab/detail", { tabId: params.tabId });
      } catch {
        return fail(`No tab ${params.tabId}.`);
      }
      const deleted: string[] = [];
      for (const sessionId of new Set(contentIds(stored.layout ?? {}))) {
        await deps.deleteSession(sessionId);
        deleted.push(sessionId);
      }
      try {
        await logCall(deps.logBase, "/log/tab/delete", { tabId: params.tabId });
      } catch (err) {
        return fail(`Deleted its conversations, but not the tab: ${
          err instanceof Error ? err.message : String(err)
        }`);
      }
      return ok(
        `Deleted tab ${params.tabId}` +
          (deleted.length ? ` and conversation(s) ${deleted.join(", ")}.` : "."),
        { tabId: params.tabId, sessions: deleted },
      );
    },
  });

  const tabLayoutMutation = defineTool({
    name: "tab-layout-mutation",
    label: "Add or remove panes",
    description:
      "Change which panes a tab has, one op at a time — the layout is derived from " +
      "where you put a pane, so you never write the tree itself.\n" +
      "  add:    { op: \"add\", nextTo: <paneId>, side: \"left\"|\"right\"|\"top\"|\"bottom\", " +
      "blueprint: <slug> } — the new agent goes on that side of that pane. A side that " +
      "crosses the panes around it (bottom, inside a row) wraps the anchor and the new " +
      "pane in a split of their own, so the anchor keeps its share.\n" +
      "  delete: { op: \"delete\", paneId: <paneId> } — the pane goes; a split left with " +
      "one child collapses into it.\n" +
      `A tab keeps 1 to ${MAX_PANES} panes. Every op is applied in order and the whole ` +
      "call is refused if any of them does not fit, so a half-applied layout is not a " +
      "state you can end up in. The tab's title is recomputed from its pages.",
    promptSnippet: "tab-layout-mutation: add or remove the panes of a tab",
    parameters: Type.Object({
      tabId: Type.String({ description: "the tab to change" }),
      ops: Type.Array(
        Type.Object({
          op: Type.String({ description: "add | delete" }),
          nextTo: Type.Optional(
            Type.String({ description: "add: the paneId to put the new pane beside" }),
          ),
          side: Type.Optional(
            Type.String({ description: "add: left | right | top | bottom" }),
          ),
          blueprint: Type.Optional(
            Type.String({ description: "add: blueprint slug for the new pane's agent" }),
          ),
          flex: Type.Optional(
            Type.String({ description: 'add: share, e.g. "2 1 0"; default even' }),
          ),
          paneId: Type.Optional(Type.String({ description: "delete: the paneId to remove" })),
        }),
        { description: "applied in order" },
      ),
    }),
    execute: async (_id, params) => {
      let stored;
      try {
        stored = await logCall(deps.logBase, "/log/tab/detail", { tabId: params.tabId });
      } catch (err) {
        return fail(`No tab ${params.tabId}: ${err instanceof Error ? err.message : String(err)}`);
      }
      let tree = stored.layout as PaneNode;
      if (!tree || (!("pane" in tree) && !("split" in tree))) {
        return fail(`Tab ${params.tabId} has no pane tree.`);
      }
      const created: string[] = [];
      const cleanup = async () => {
        for (const id of created) {
          try {
            await deps.deleteSession(id);
          } catch {
            // best effort: the refusal is what gets reported
          }
        }
      };

      for (const raw of params.ops ?? []) {
        const op = String(raw.op ?? "").trim();
        if (op === "add") {
          const nextTo = String(raw.nextTo ?? "").trim();
          const side = String(raw.side ?? "").trim() as Side;
          const slug = String(raw.blueprint ?? "").trim();
          if (!nextTo) {
            await cleanup();
            return fail(`add needs nextTo — one of this tab's panes: ${paneIds(tree).join(", ")}.`);
          }
          if (!["left", "right", "top", "bottom"].includes(side)) {
            await cleanup();
            return fail('add needs side: "left", "right", "top" or "bottom".');
          }
          if (!slug) {
            await cleanup();
            return fail("add needs blueprint: the slug of a page to instantiate.");
          }
          if (paneCount(tree) >= MAX_PANES) {
            await cleanup();
            return fail(`a tab holds at most ${MAX_PANES} panes — this one already has ${paneCount(tree)}.`);
          }
          let sessionId = "";
          try {
            sessionId = await deps.newSession(slug);
          } catch (err) {
            await cleanup();
            return fail(
              `Could not instantiate ${slug}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          created.push(sessionId);
          const leaf: PaneLeaf = { pane: { paneId: newPaneId(), contentId: sessionId } };
          if (typeof raw.flex === "string" && raw.flex.trim()) leaf.pane.flex = raw.flex.trim();
          const res = addPane(tree, nextTo, side, leaf);
          if (!res.added) {
            await cleanup();
            return fail(
              `No pane ${nextTo} in this tab. Its panes: ${paneIds(tree).join(", ") || "(none)"}.`,
            );
          }
          tree = res.tree;
        } else if (op === "delete") {
          const paneId = String(raw.paneId ?? "").trim();
          if (!paneId) {
            await cleanup();
            return fail(`delete needs paneId — one of this tab's panes: ${paneIds(tree).join(", ")}.`);
          }
          if (paneCount(tree) <= 1) {
            await cleanup();
            return fail("a tab keeps at least one pane — delete the tab instead.");
          }
          const res = deletePane(tree, paneId);
          if (!res.deleted) {
            await cleanup();
            return fail(
              `No pane ${paneId} in this tab. Its panes: ${paneIds(tree).join(", ") || "(none)"}.`,
            );
          }
          tree = res.tree;
        } else {
          await cleanup();
          return fail(`unknown op ${JSON.stringify(op)}: use "add" or "delete".`);
        }
        if (paneCount(tree) < 1) {
          await cleanup();
          return fail("a tab keeps at least one pane — delete the tab instead.");
        }
      }
      if (paneCount(tree) < 1) {
        await cleanup();
        return fail("a tab keeps at least one pane — delete the tab instead.");
      }
      // Deleting a pane does not delete its conversation: the conversation belongs
      // to this tab, and a tab that has stopped showing it is a tab that can show it
      // again. Only tab-delete removes conversations.
      try {
        const saved = await logCall(deps.logBase, "/log/tab/mutation", {
          tabId: params.tabId,
          title: await tabTitle(deps, tree),
          layout: tree,
        });
        return ok(
          `Tab ${saved.tabId} — ${saved.title || "(untitled)"}:\n` +
            describeLayout((saved.layout ?? tree) as PaneNode),
          { tabId: saved.tabId, title: saved.title ?? "", layout: saved.layout ?? tree },
        );
      } catch (err) {
        await cleanup();
        return fail(
          `Layout rejected: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  });

  return [currentTabList, currentTabMutation, tabNew, tabDelete, tabLayoutMutation];
}
