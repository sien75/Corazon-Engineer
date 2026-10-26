// The main agent's workspace tools. main is the one conversation the shell
// itself hosts; everything it can do to the workspace — see what is on screen,
// put a session on screen and take it off, make an agent, delete one — is a tool
// here. A blueprint agent (sub) gets none of these: its page is a view, not a
// workspace.
//
// There is no tab entity. A tab is one open session — the shell draws one tab per
// session id in log's open list — so these tools speak session and the word "tab"
// only appears where the user sees one.
//
// The tools never talk to the frontend. They write log (sessions, current) and
// return; the shell runs main's stream itself, so the tool frame is what makes it
// redraw. One source of truth, one direction.
//
// There is no tool that changes what a tab looks like: a tab holds exactly one
// agent, and its page is that agent's blueprint.

import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import YAML from "yaml";

export interface WorkspaceDeps {
  logBase: string;
  // Open a new conversation from a blueprint slug inside a project (the session
  // row, its project, its blueprint and its title are written by the registry);
  // returns its id.
  newSession: (blueprint: string, project: string) => Promise<string>;
  // Open a new main conversation (kind "main": the same role and tools as the
  // one these tools run inside); returns its id. The pointer is moved by the
  // tool itself — the registry only makes the session.
  newMainSession: () => Promise<string>;
  // Make an existing conversation live again (or prove it can be): a session
  // still in memory is a no-op, one with records is rebuilt from them. Throws
  // when the id has nothing to resume.
  resumeSession: (id: string) => Promise<void>;
  // Hard delete: dispose the live session and delete its records and its row.
  // The page is the blueprint's, shared with every other agent of it, so it stays.
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

// oneLine shortens a text for a tool result.
function oneLine(s: unknown, max = 100): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// sessionMeta reads a conversation's role, page and display name.
async function sessionMeta(deps: WorkspaceDeps, sessionId: string) {
  return logCall<{ sessionId: string; kind: string; blueprint: string; title: string }>(
    deps.logBase,
    "/log/session/detail",
    { sessionId },
  );
}

export function makeWorkspaceTools(deps: WorkspaceDeps) {
  const sessionList = defineTool({
    name: "session-list",
    label: "List open sessions",
    description:
      "What is on screen right now: main, and every open session (each is one tab) " +
      "in display order, with its sessionId, title, blueprint and when it was last " +
      "active. A closed session keeps its records and stays reachable from the " +
      "launcher — put it back with session-open.",
    promptSnippet: "session-list: the sessions on screen",
    parameters: Type.Object({}),
    execute: async () => {
      const current = await logCall<{ openSessions?: string[]; mainSession?: string }>(
        deps.logBase,
        "/log/current/get",
        {},
      );
      const list = await logCall<{ sessions?: any[] }>(deps.logBase, "/log/list", {
        pageNum: 1,
      });
      const byId = new Map<string, any>();
      for (const rec of list.sessions ?? []) byId.set(String(rec.sessionId), rec);
      const rows: any[] = [];
      const lines: string[] = [];
      for (const sessionId of current.openSessions ?? []) {
        const rec = byId.get(sessionId);
        if (!rec) {
          rows.push({ sessionId, title: "", blueprint: "", lastAt: "" });
          lines.push(`session ${sessionId}  (session row missing)`);
          continue;
        }
        rows.push({
          sessionId,
          title: rec.title ?? "",
          projectId: rec.projectId ?? "",
          blueprint: rec.blueprint ?? "",
          lastAt: rec.lastAt ?? "",
        });
        lines.push(
          `session ${sessionId}  ${oneLine(rec.title || "(untitled)", 40)}  ` +
            `project ${rec.projectId || "-"}  ${rec.blueprint || "-"}  ${rec.lastAt ?? ""}`,
        );
      }
      const body = [
        `main: ${current.mainSession || "(none)"}`,
        rows.length ? lines.join("\n") : "no sessions open",
      ].join("\n");
      return ok(body, { mainSession: current.mainSession, sessions: rows });
    },
  });

  const sessionOpen = defineTool({
    name: "session-open",
    label: "Put a session on screen",
    description:
      "Put existing sessions back on screen, in the order given. This adds no tab " +
      "and creates nothing — the tab is the session, so reopening one shows the same " +
      "conversation again, history and all. `index` says where the first newly " +
      "opened one goes; omitted appends to the end. Idempotent: one that is already " +
      "open keeps its place. Use session-new to make a new agent; main itself is not " +
      "a session you can open (use main-resume).",
    promptSnippet: "session-open: put a session back on screen",
    parameters: Type.Object({
      sessionIds: Type.Array(Type.String(), { description: "the sessions to put on screen" }),
      index: Type.Optional(
        Type.Number({
          description: "where the first newly opened one goes; omitted appends to the end",
        }),
      ),
    }),
    execute: async (_id, params) => {
      const sessionIds = (params.sessionIds ?? [])
        .map((s: string) => String(s ?? "").trim())
        .filter(Boolean);
      if (!sessionIds.length) return fail("session-open needs sessionIds — session-list has them.");
      for (const sessionId of sessionIds) {
        let meta;
        try {
          meta = await sessionMeta(deps, sessionId);
        } catch {
          return fail(`No session ${sessionId}. session-list has the ones that are open.`);
        }
        if (String(meta.kind ?? "sub") === "main") {
          return fail(
            `${sessionId} is main, not a tab — main-resume switches the shell to it.`,
          );
        }
      }
      let openSessions: string[] = [];
      try {
        const body = await logCall<{ openSessions?: string[] }>(
          deps.logBase,
          "/log/session/on",
          { sessionIds, ...(typeof params.index === "number" ? { index: params.index } : {}) },
        );
        openSessions = body.openSessions ?? [];
      } catch (err) {
        return fail(`Could not open them: ${err instanceof Error ? err.message : String(err)}`);
      }
      return ok(
        openSessions.length ? `open sessions: ${openSessions.join(", ")}` : "no sessions open",
        { openSessions },
      );
    },
  });

  const sessionClose = defineTool({
    name: "session-close",
    label: "Take a session off screen",
    description:
      "Close tabs: take sessions off screen and keep everything they hold. A closed " +
      "session is not deleted — its records and its page stay, and session-open puts " +
      "it back. Idempotent: closing one that is not open does nothing. To destroy a " +
      "conversation, use session-delete.",
    promptSnippet: "session-close: close tabs, keeping the conversations",
    parameters: Type.Object({
      sessionIds: Type.Array(Type.String(), { description: "the sessions to close" }),
    }),
    execute: async (_id, params) => {
      const sessionIds = (params.sessionIds ?? [])
        .map((s: string) => String(s ?? "").trim())
        .filter(Boolean);
      if (!sessionIds.length) return fail("session-close needs sessionIds — session-list has them.");
      let openSessions: string[] = [];
      try {
        const body = await logCall<{ openSessions?: string[] }>(
          deps.logBase,
          "/log/session/off",
          { sessionIds },
        );
        openSessions = body.openSessions ?? [];
      } catch (err) {
        return fail(`Could not close them: ${err instanceof Error ? err.message : String(err)}`);
      }
      return ok(
        openSessions.length ? `open sessions: ${openSessions.join(", ")}` : "no sessions open",
        { openSessions },
      );
    },
  });

  const sessionNew = defineTool({
    name: "session-new",
    label: "New agent in a new tab",
    description:
      "Make a new agent from a blueprint inside a project and put it on screen as " +
      "a tab of its own. The agent runs in that project's folder and its page is " +
      "read from that project's .agents/blueprints/ — so the project is required " +
      "(project-list has the ids). The session id is assigned here — you never " +
      "pass one, and an existing conversation cannot be moved into a new tab " +
      "(reopen it with session-open instead).",
    promptSnippet: "session-new: a new agent in a new tab",
    parameters: Type.Object({
      project: Type.String({ description: "project id (from project-list)" }),
      blueprint: Type.String({ description: "blueprint slug to instantiate" }),
    }),
    execute: async (_id, params) => {
      const slug = String(params.blueprint ?? "").trim();
      const project = String(params.project ?? "").trim();
      if (!slug) return fail("session-new needs `blueprint` — project-list lists the projects, and a project's .agents/blueprints/ has the slugs.");
      if (!project) return fail("session-new needs `project` (a project id from project-list).");
      let sessionId = "";
      try {
        sessionId = await deps.newSession(slug, project);
      } catch (err) {
        return fail(
          `Could not instantiate ${slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      try {
        await logCall(deps.logBase, "/log/session/on", { sessionIds: [sessionId] });
      } catch (err) {
        // A session nothing shows is a stray: drop it.
        try {
          await deps.deleteSession(sessionId);
        } catch {
          // the original error is what matters
        }
        return fail(
          `Could not put it on screen: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      let title = "";
      try {
        title = (await sessionMeta(deps, sessionId)).title ?? "";
      } catch {
        title = ""; // the row is written; a missing name is not worth failing on
      }
      return ok(`Tab for ${sessionId} — ${title || slug}, agent ${sessionId}.`, {
        sessionId,
        title,
        project,
        blueprint: slug,
      });
    },
  });

  // project-list is how main knows which folders it is working across: an agent
  // belongs to one project, and its id is what session-new takes.
  const projectList = defineTool({
    name: "project-list",
    label: "List projects",
    description:
      "The project board: every folder the user opened in Engineer, with its " +
      "projectId, name and path. This is the board — a project taken off it does " +
      "not appear, though its conversations keep their records.",
    promptSnippet: "project-list: the projects on the board",
    parameters: Type.Object({}),
    execute: async () => {
      let data;
      try {
        data = await logCall<{ projects?: any[] }>(deps.logBase, "/log/project/list", {});
      } catch (err) {
        return fail(`Could not read the projects: ${err instanceof Error ? err.message : String(err)}`);
      }
      const rows = (data.projects ?? []).map((p) => ({
        projectId: String(p.projectId ?? ""),
        name: String(p.name ?? ""),
        path: String(p.path ?? ""),
      }));
      const body = rows.length
        ? rows
            .map((r) => `project ${r.projectId}  ${oneLine(r.name || "(unnamed)", 40)}  ${r.path}`)
            .join("\n")
        : "no projects on the board";
      return ok(body, { projects: rows });
    },
  });

  const sessionDelete = defineTool({
    name: "session-delete",
    label: "Delete a session",
    description:
      "Delete one conversation for good: its agent, its records and its session row, " +
      "and take its tab off screen. This cannot be undone — the page stays, it " +
      "belongs to the blueprint. main is refused: replace the shell's own " +
      "conversation with main-new instead. To take a tab off screen without " +
      "deleting it, use session-close.",
    promptSnippet: "session-delete: delete a session and its conversation",
    parameters: Type.Object({
      sessionId: Type.String({ description: "the session to delete" }),
    }),
    execute: async (_id, params) => {
      const sessionId = String(params.sessionId ?? "").trim();
      if (!sessionId) return fail("session-delete needs sessionId — session-list has them.");
      let meta;
      try {
        meta = await sessionMeta(deps, sessionId);
      } catch {
        return fail(`No session ${sessionId}.`);
      }
      if (String(meta.kind ?? "sub") === "main") {
        return fail(
          `${sessionId} is main — it cannot delete itself (that would delete the ` +
            "conversation you are running in). Use main-new to replace it.",
        );
      }
      try {
        await deps.deleteSession(sessionId);
      } catch (err) {
        return fail(`Could not delete ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
      }
      // The row is gone; an id left in the open list would draw a tab with nothing
      // behind it. Closing is the second half of the same intent.
      try {
        await logCall(deps.logBase, "/log/session/off", { sessionIds: [sessionId] });
      } catch {
        // the shell repairs the list on load
      }
      return ok(`Deleted ${sessionId}${meta.title ? ` (${meta.title})` : ""} for good.`, {
        sessionId,
      });
    },
  });

  const mainNew = defineTool({
    name: "main-new",
    label: "New main conversation",
    description:
      "Replace main with a fresh conversation: a new session is made with this one's " +
      "role and tools, log's workspace pointer moves to it, and the shell switches to " +
      "it. This conversation is not deleted — its records stay in log, and main-resume " +
      "brings it back — but nothing shows it once the call returns, so anything you " +
      "still want the user to read has to come before it.",
    promptSnippet: "main-new: replace main with a fresh conversation",
    parameters: Type.Object({}),
    execute: async () => {
      let current;
      try {
        current = await logCall<{ openSessions?: string[]; mainSession?: string }>(
          deps.logBase,
          "/log/current/get",
          {},
        );
      } catch (err) {
        return fail(
          `Could not read the workspace: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const previous = String(current.mainSession ?? "");
      let sessionId = "";
      try {
        sessionId = await deps.newMainSession();
      } catch (err) {
        return fail(
          `Could not start a new main conversation: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      try {
        await logCall(deps.logBase, "/log/current/put", {
          // The open list is main's business only when a tab changes: write it
          // back untouched, or this call would close every tab.
          openSessions: current.openSessions ?? [],
          mainSession: sessionId,
        });
      } catch (err) {
        // A main nothing points at is a stray: drop it.
        try {
          await deps.deleteSession(sessionId);
        } catch {
          // the original error is what matters
        }
        return fail(
          `Could not switch main to the new conversation: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return ok(
        `main is now ${sessionId}` +
          (previous
            ? `; ${previous} keeps its records — main-resume ${previous} brings it back.`
            : "."),
        { sessionId, previous },
      );
    },
  });

  const mainList = defineTool({
    name: "main-list",
    label: "List main conversations",
    description:
      "Main's own conversations, most recently active first: the id to give main-resume, " +
      "when it was last active, how many messages it holds and the first thing the user " +
      "said. The one on screen is marked `*`. Blueprint agents are not here — " +
      "session-open is how those get on screen.",
    promptSnippet: "main-list: main's earlier conversations, with their ids",
    parameters: Type.Object({
      pageNum: Type.Optional(
        Type.Number({ description: "page number, 1-based; 100 conversations per page" }),
      ),
    }),
    execute: async (_id, params) => {
      let list;
      try {
        list = await logCall(deps.logBase, "/log/list", {
          pageNum: Number(params.pageNum) || 1,
        });
      } catch (err) {
        return fail(
          `Could not read the conversations: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      let current = "";
      try {
        current = String(
          (await logCall(deps.logBase, "/log/current/get", {})).mainSession ?? "",
        );
      } catch {
        // a missing pointer does not make the list useless
      }
      const rows = (list.sessions ?? [])
        .filter((s: any) => s.kind === "main")
        .map((s: any) => ({
          sessionId: String(s.sessionId ?? ""),
          createdAt: String(s.createdAt ?? ""),
          lastAt: String(s.lastAt ?? ""),
          count: Number(s.count ?? 0),
          preview: String(s.preview ?? ""),
          current: String(s.sessionId ?? "") === current,
        }));
      const lines = rows.map(
        (r: { current: boolean; sessionId: string; lastAt: string; count: number; preview: string }) =>
          `${r.current ? "*" : " "} ${r.sessionId}  ${r.lastAt}  ${r.count} msg(s)  ` +
          `${oneLine(r.preview, 60) || "(no messages)"}`,
      );
      const body = [
        `current: ${current || "(none)"}`,
        rows.length ? lines.join("\n") : "no main conversation has messages yet",
        list.hasMore ? "(more on the next page — pass pageNum)" : "",
      ].filter(Boolean);
      return ok(body.join("\n"), { current, mains: rows });
    },
  });

  const mainResume = defineTool({
    name: "main-resume",
    label: "Resume a main conversation",
    description:
      "Put an earlier main conversation back on screen: log's pointer moves to it, the " +
      "shell switches to it and its history comes back with it — the conversation you are " +
      "in now goes back to being a record. Take the id from main-list. A conversation " +
      "already on screen is a no-op; a blueprint agent's id is refused, because " +
      "session-open is how those get on screen.",
    promptSnippet: "main-resume: bring an earlier main conversation back on screen",
    parameters: Type.Object({
      sessionId: Type.String({
        description: "the main conversation to bring back — main-list lists the ids",
      }),
    }),
    execute: async (_id, params) => {
      const sessionId = String(params.sessionId ?? "").trim();
      if (!sessionId) return fail("main-resume needs sessionId — main-list has the ids.");
      let meta;
      try {
        meta = await sessionMeta(deps, sessionId);
      } catch {
        return fail(
          `No conversation ${sessionId}. main-list has the ones that can be resumed.`,
        );
      }
      if (String(meta?.kind ?? "sub") !== "main") {
        const slug = String(meta?.blueprint ?? "");
        return fail(
          `${sessionId} is a blueprint agent${slug ? ` (${slug})` : ""}, not a main ` +
            "conversation — session-open is how it gets on screen.",
        );
      }
      let current;
      try {
        current = await logCall<{ openSessions?: string[]; mainSession?: string }>(
          deps.logBase,
          "/log/current/get",
          {},
        );
      } catch (err) {
        return fail(
          `Could not read the workspace: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const previous = String(current.mainSession ?? "");
      if (previous === sessionId) {
        return ok(`main is already ${sessionId}.`, { sessionId, previous });
      }
      // Prove there is something to come back to before pointing the screen at
      // it: a live session is a no-op, records alone are enough to rebuild it.
      try {
        await deps.resumeSession(sessionId);
      } catch (err) {
        return fail(
          `Could not resume ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      try {
        await logCall(deps.logBase, "/log/current/put", {
          openSessions: current.openSessions ?? [],
          mainSession: sessionId,
        });
      } catch (err) {
        return fail(
          `Could not switch main to ${sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return ok(
        `main is now ${sessionId}` +
          (previous
            ? `; ${previous} keeps its records and main-resume brings it back.`
            : "."),
        { sessionId, previous },
      );
    },
  });

  return [
    projectList,
    sessionList,
    sessionOpen,
    sessionClose,
    sessionNew,
    sessionDelete,
    mainList,
    mainNew,
    mainResume,
  ];
}
