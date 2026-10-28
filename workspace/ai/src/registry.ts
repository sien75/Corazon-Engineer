import { randomBytes } from "node:crypto";
import YAML from "yaml";
import { Type } from "typebox";
import {
  createAgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
  getAgentDir,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import {
  record,
  drainRecords,
  fetchRecords,
  externalizeImages,
  inlineImages,
  projectText,
  type StoredRecord,
} from "./recorder.ts";
import { blueprintTitle, blueprintReadme } from "./blueprint.ts";
import { makeWorkspaceTools } from "./workspace.ts";
import { makeModelTool } from "./model.ts";
import { makeUsageTool } from "./usage.ts";
import { makeCompactTool } from "./compact.ts";
import {
  cleanTitle,
  titleMaterial,
  TITLE_EVERY,
  TITLE_SYSTEM_PROMPT,
  TITLE_TEMPERATURE,
  TITLE_TIMEOUT_MS,
} from "./title.ts";
import { loadImage, saveImage } from "./blobs.ts";
import { dbg } from "./debug.ts";

// The workspace tools main alone may call. Names are listed here because pi's
// allowlist is by name, not by tool object.
const WORKSPACE_TOOLS = [
  "project-list",
  "session-list",
  "session-open",
  "session-close",
  "main-list",
  "main-new",
  "main-resume",
  "session-new",
  "session-delete",
];

// pageLine is the last thing a sub agent is told: which directory its page lives
// in. The prompt carries the README; the path is what makes "change the page" an
// action rather than a wish.
function pageLine(slug: string): string {
  return `Your page: .agents/blueprints/${slug}/ — that directory is what /agent/<sessionId>/ serves, for every agent made from this blueprint. Edit its files (index.html and anything beside it) and ask the user to reload; the change lands in this project's working tree.`;
}

// A user turn as received on /ai/ask: ordered text/image blocks. Images carry
// base64 + mime and are persisted to the blob store; text is the prompt text
// (with [image] position tokens).
export type IncomingBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type Model = Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number];

// The SSE envelope sent to the frontend. It carries the native pi event as-is
// (passthrough) plus a per-session `seq`. A non-pi `error` event reuses the
// shape of pi's assistant-message error: { type, reason, error }.
export interface EngineerEvent {
  seq: number;
  type: string;
  [key: string]: unknown;
}

type Listener = (ev: EngineerEvent) => void;

// ask_user: the one custom tool (skills and blueprints are plain files the
// agent writes with write/edit, so they need no tool of their own). It does not
// block: it ends the current run and the user's answer arrives later as a normal
// user text turn on /ai/ask — the one input path, which is also where
// permission/approval logic would go.
const askUserTool = defineTool({
  name: "ask_user",
  label: "Ask user",
  description:
    "Ask the user a question and end the current turn. The user's answer will " +
    "arrive as the next user message. Use this when you need a decision or " +
    "missing information from the user before continuing.",
  promptSnippet: "ask_user: ask the user and wait for their answer",
  parameters: Type.Object({
    text: Type.String({ description: "The question to ask the user" }),
    options: Type.Optional(
      Type.Array(
        Type.Object({
          label: Type.String({ description: "Choice label shown to the user" }),
          value: Type.String({ description: "Value sent back as the answer" }),
        }),
        { description: "Choices; omit for a free-form answer" },
      ),
    ),
  }),
  executionMode: "sequential",
  execute: async (_toolCallId, params) => {
    return {
      content: [
        {
          type: "text",
          text: "Question shown to the user; their answer will arrive as the next user message.",
        },
      ],
      details: { text: params.text, options: params.options ?? [] },
      terminate: true,
    };
  },
});

interface Sess {
  id: string;
  // "main" is the one conversation the shell hosts (workspace tools); "sub" is
  // everything instantiated from a blueprint (a page, ask_user, no workspace).
  kind: "main" | "sub";
  agent?: AgentSession; // undefined in stub mode (no API key)
  events: EngineerEvent[];
  listeners: Set<Listener>;
  tail: Promise<void>; // serializes prompts within the session
  turnText: string; // accumulated assistant text of the in-flight run
  // Text of the whole run (user turns + assistant prose, never tool traffic),
  // queued for the suggestion scan when the run settles.
  runText: string;
  recordSeq: number;
  sawSettled: boolean; // whether pi emitted agent_settled for the current run
  active: boolean; // a run is scheduled or in flight (used by resume/stream)
  // A manual compaction has been scheduled by the `compact` tool and its
  // compaction_end has not arrived yet. The run is over (agent_settled) but the
  // session is not idle, so the SSE stream must stay open past agent_settled —
  // otherwise the compaction happens with nobody watching.
  compacting: boolean;
  // How many user turns this conversation has seen. Recovered from the records
  // at build (a user record is a turn), so the title schedule — 1, 11, 21, … —
  // survives a restart in the middle of it.
  turns: number;
  // A title call is in flight. It is out of band, so it must not stack: two
  // triggers arriving together would write two names for one conversation.
  titling: boolean;
  // The name last written for this conversation, so an unchanged summary is not
  // written again.
  title: string;
}

export interface RegistryOptions {
  // The engineer home: this service's own data (uploaded images). Not a project
  // — a session's project folder comes from log, per session.
  home: string;
  logBase: string;
  // The two role specs, already carrying the runtime endpoints. main gets the
  // workspace tools; sub gets its blueprint's README appended after this.
  specs: { main: string; sub: string };
  forceStub?: boolean; // skip model resolution entirely (offline / tests)
}

// Registry owns all chat sessions. The agent loop itself is pi's
// (@earendil-works/pi-coding-agent SDK, in-process); this class subscribes to
// pi's AgentSession events and forwards them (native format) over SSE.
export class Registry {
  private sessions = new Map<string, Sess>();
  private modelRuntime?: ModelRuntime;
  // What pi's own config makes available right now. Nothing here chooses a
  // model for a session — pi does that — it only answers "is there any model at
  // all?", which is the difference between a real session and the echo stub.
  private available: Model[] = [];

  constructor(private opts: RegistryOptions) {}

  // init opens pi's model runtime (its catalog + auth, i.e. pi's own config). No
  // model is picked here: which model a session runs is pi's decision, from
  // settings' defaultProvider/defaultModel or, failing that, the first model it
  // has. Without any authenticated provider it falls back to the dev echo stub.
  async init(): Promise<void> {
    if (this.opts.forceStub) return; // dev stub forced (offline / tests)
    this.modelRuntime = await ModelRuntime.create();
    this.available = [...(await this.modelRuntime.getAvailable())];
  }

  // makeLoader builds the resource loader for one session's role. `tail` is
  // appended after everything else — a sub agent's blueprint README goes there,
  // so it reads as the last word on what this particular agent's UI is. The
  // session's settings manager goes in, so the trust decision the loader makes
  // (and everything else it reads from settings) is the one the session runs
  // under — pi's own wiring, one instance per session.
  private makeLoader(
    kind: "main" | "sub",
    cwd: string,
    settings: SettingsManager,
    tail?: string,
  ): DefaultResourceLoader {
    const spec = this.opts.specs[kind];
    return new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      settingsManager: settings,
      // Append the spec instead of overriding the system prompt: pi only emits
      // its "Available tools" list (which is where custom tools like ask_user
      // surface) when the system prompt is not fully replaced.
      appendSystemPromptOverride: (base) =>
        tail ? [...base, spec, tail] : [...base, spec],
    });
  }

  get stub(): boolean {
    return !this.modelRuntime || this.available.length === 0;
  }

  // modelFor resolves a provider/model-id (or a bare id that names exactly one
  // model) against what pi can use right now. undefined means "not usable here":
  // a name pi has no catalog entry for, or a provider without credentials.
  modelFor(ref: string): Model | undefined {
    const want = String(ref ?? "").trim();
    if (!want) return undefined;
    const exact = this.available.find((m) => `${m.provider}/${m.id}` === want);
    if (exact) return exact;
    const byId = this.available.filter((m) => m.id === want);
    return byId.length === 1 ? byId[0] : undefined;
  }

  // homeDir is where this service keeps its own files (uploaded images). It is
  // shared by every project: an image belongs to a conversation, not a folder.
  get homeDir(): string {
    return this.opts.home;
  }

  // projectDir resolves a project id to the folder that project lives in. The
  // board is log's; this service only asks. Throws when the id names nothing —
  // a blueprint agent with no project has no page and no place to run.
  private async projectDir(projectID: unknown): Promise<string> {
    const id = String(projectID ?? "").trim();
    if (!id) throw new Error("projectId missing: a blueprint agent belongs to a project");
    const res = await fetch(`${this.opts.logBase}/log/project/get`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: YAML.stringify({ projectId: id }),
    });
    if (!res.ok) throw new Error(`no project ${id} (log /log/project/get: HTTP ${res.status})`);
    const data: any = YAML.parse(await res.text());
    const dir = String(data?.path ?? "").trim();
    if (!dir) throw new Error(`project ${id} has no folder on record`);
    return dir;
  }

  // new opens a conversation. kind="main" is the shell's own chat (no blueprint,
  // no page, no project); kind="sub" is made from a blueprint inside one project:
  // the prototype's README and the path of its directory are appended to this
  // session's system prompt — last, after the role spec — so the model knows what
  // its UI is and where it lives. Nothing is copied: the web server serves the
  // prototype itself, so the page this agent edits is the page every agent of the
  // same blueprint sees.
  async new(
    blueprint?: string,
    kind: "main" | "sub" = "sub",
    projectID = "",
    model = "",
  ): Promise<Sess> {
    const id = `s_${randomBytes(8).toString("hex")}`;
    const project = kind === "sub" ? await this.projectDir(projectID) : "";
    const readme = blueprint ? blueprintReadme(project, blueprint) : undefined;
    const tail = blueprint ? `${readme ?? ""}\n\n${pageLine(blueprint)}` : undefined;
    // The name the tab bar draws before a word has been said; the conversation
    // itself replaces it on its 1st, 11th, 21st … turn (see maybeTitle).
    const title = blueprint ? blueprintTitle(project, blueprint) : "main";
    await this.writeSession(id, kind, projectID, blueprint ?? "", title, model);
    return this.build(id, [], kind, project, tail, title, model);
  }

  // writeSession records what a conversation is — its role, the blueprint its page
  // comes from, the name the tab bar shows and the model it runs. The name is the
  // page's <title> (resolved here, not by the page at runtime), so the shell can
  // draw a tab before it loads anything; log owns the row, and it is the only
  // place the mapping lives.
  private async writeSession(
    id: string,
    kind: "main" | "sub",
    projectID: string,
    blueprint: string,
    title: string,
    model: string,
  ): Promise<void> {
    await this.upsertSession({ sessionId: id, kind, projectId: projectID, blueprint, title, model });
  }

  // upsertSession is the one writer of a session row. An empty field keeps the
  // stored value (see the contract), so a patch only sends what it changes —
  // plus kind, which the store does not treat as optional.
  private async upsertSession(patch: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.opts.logBase}/log/session/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: YAML.stringify(patch),
    });
    if (!res.ok) {
      throw new Error(`log/session/upsert: HTTP ${res.status}`);
    }
  }

  // sessionMeta reads a conversation's role and the blueprint its page comes
  // from. undefined means "log has no row": the id is not one this workspace
  // knows. A row with kind "sub" (or no kind at all) is a blueprint agent —
  // which, unlike a conversation with no messages, can still be rebuilt.
  private async sessionMeta(
    id: string,
  ): Promise<
    | { kind: "main" | "sub"; projectID: string; blueprint: string; title: string; model: string }
    | undefined
  > {
    try {
      const res = await fetch(`${this.opts.logBase}/log/session/detail`, {
        method: "POST",
        headers: { "Content-Type": "application/yaml" },
        body: YAML.stringify({ sessionId: id }),
      });
      if (!res.ok) return undefined;
      const data: any = YAML.parse(await res.text());
      return {
        kind: data?.kind === "main" ? "main" : "sub",
        projectID: String(data?.projectId ?? ""),
        blueprint: String(data?.blueprint ?? ""),
        title: String(data?.title ?? ""),
        model: String(data?.model ?? ""),
      };
    } catch {
      return undefined;
    }
  }

  // deleteSession is the hard delete: the live session and its records. The page
  // is the blueprint's, shared with every other agent of it, so it stays.
  async deleteSession(id: string): Promise<void> {
    this.delete(id);
    const res = await fetch(`${this.opts.logBase}/log/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: YAML.stringify({ sessionId: id }),
    });
    if (!res.ok) {
      throw new Error(`log/delete: HTTP ${res.status}`);
    }
  }

  // sessionExists answers "would /ai/resume find this?" — a live session, a row
  // in sessions (an instantiated agent), or recorded history. main's tab-on uses
  // it to tell a real session id from one the model made up, and session-delete
  // uses it as its guard (log/delete is silent about unknown ids).
  private async sessionExists(id: string): Promise<boolean> {
    if (this.sessions.has(id)) return true;
    if (await this.sessionMeta(id)) return true;
    const history = await fetchRecords(this.opts.logBase, id);
    return history.length > 0;
  }

  // resume rebuilds a session that is no longer in memory from its log records.
  // Returns undefined when the id has no live session and no recorded history.
  async resume(id: string): Promise<Sess | undefined> {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    const [history, meta] = await Promise.all([
      fetchRecords(this.opts.logBase, id),
      this.sessionMeta(id),
    ]);
    // An instantiated agent has a session row before it has a single message;
    // that is still a session worth resuming — otherwise a page that has never
    // been asked would 404 for the rest of the process's life.
    if (!meta && !history.length) return undefined;
    const kind = meta?.kind ?? "sub";
    // A sub session runs in the folder of the project it belongs to: that is its
    // cwd, and where its page (the blueprint) is read from. A project taken off
    // the board still has its row, so its conversations keep working; a row that
    // is truly gone is the case where there is nothing to resume into.
    let project = "";
    if (kind === "sub") project = await this.projectDir(meta?.projectID);
    // The page is the blueprint's, so its README is read from the prototype —
    // current, not frozen.
    let tail: string | undefined;
    if (kind === "sub" && meta?.blueprint) {
      let readme: string | undefined;
      try {
        readme = blueprintReadme(project, meta.blueprint);
      } catch {
        readme = undefined; // the prototype was deleted: the page is gone too
      }
      tail = `${readme ?? ""}\n\n${pageLine(meta.blueprint)}`;
    }
    return this.build(id, history, kind, project, tail, meta?.title ?? "", meta?.model ?? "");
  }

  private async build(
    id: string,
    history: StoredRecord[] = [],
    kind: "main" | "sub" = "sub",
    project = "",
    blueprintReadme?: string,
    title = "",
    modelChoice = "",
  ): Promise<Sess> {
    // Where this conversation's agent works: the project folder it belongs to, or
    // the home for main — main is the shell's own chat and belongs to no project.
    const cwd = project || this.opts.home;
    const sess: Sess = {
      id,
      kind,
      events: [],
      listeners: new Set(),
      tail: Promise.resolve(),
      turnText: "",
      runText: "",
      // Continue the recorder's per-session sequence after a resume.
      recordSeq: history.reduce((max, m) => Math.max(max, m.seq), 0),
      sawSettled: false,
      active: false,
      compacting: false,
      turns: history.filter((m) => m.role === "user").length,
      titling: false,
      title,
    };
    if (!this.stub) {
      // Settings are pi's own local config, read fresh per session: the global
      // ~/.pi/agent/settings.json (or PI_CODING_AGENT_DIR), plus the project's
      // .pi/settings.json once the project is trusted. Nothing is held in memory
      // or duplicated here — an edit in pi applies to the next session built, and
      // the loader and the session share the one instance, as they do in pi's CLI.
      const settings = SettingsManager.create(cwd, getAgentDir());
      for (const err of settings.drainErrors()) {
        const where = err.path ? ` (${err.path})` : "";
        console.error(`warning: ${err.scope} settings${where}: ${err.error.message}`);
      }
      // The role's spec, plus (for a sub agent) its blueprint's README as the
      // tail, so it knows its own UI from the first turn.
      const loader = this.makeLoader(kind, cwd, settings, blueprintReadme);
      await loader.reload();
      const sessionManager = SessionManager.inMemory(cwd);
      // Rebuild context compaction-aware: the latest compaction summary plus the
      // records after it. Summarized history is not re-sent to the provider.
      // Repair runs *after* the slice: the cut is an index, so it can land
      // between an assistant and the tool results it asked for, and repairing
      // before it would leave the orphans the cut just made. A damaged history
      // that is replayed as-is is fatal rather than cosmetic — the provider
      // rejects the whole request, and every later prompt replays it again.
      const context = sanitizeHistory(id, history.slice(lastCompactionIndex(history)));
      // Legacy rows (written before records carried pi's raw message) name no
      // api/provider/model, and there is no process-wide model to borrow: it is
      // pi's choice per session. Borrow the last shape this session really used
      // so replayed context keeps the form the provider sent it in.
      const last = [...history]
        .reverse()
        .find((m) => m.raw && m.role === "assistant")?.raw as any;
      const legacy = {
        api: last?.api,
        provider: last?.provider,
        model: last?.model,
      };
      for (const m of context) {
        const msg = this.toAgentMessage(m, legacy);
        if (msg) sessionManager.appendMessage(msg);
      }
      // Which model this session runs, strongest claim first: the last `model`
      // switch recorded in its own conversation (so a restart does not undo it),
      // then the model it was created with, then nothing at all — pi resolves
      // that from its own settings, exactly as its CLI does. A ref pi can no
      // longer use (a retired model, a provider without credentials) falls back
      // rather than failing the session: the conversation is worth more than the
      // model it was on.
      const recorded = lastModelChoice(history);
      const wanted = recorded?.model || modelChoice;
      const model = wanted ? this.modelFor(wanted) : undefined;
      if (wanted && !model) {
        console.warn(
          `engineer ai: session ${id} was on ${wanted}, which pi cannot use now; falling back`,
        );
      }
      const modelTool = makeModelTool({
        runtime: this.modelRuntime,
        getAgent: () => sess.agent,
        persist: (choice) => this.persistModel(sess, choice),
      });
      const usageTool = makeUsageTool({ getAgent: () => sess.agent });
      // compact() aborts and waits for idle, so it can never run inside the turn
      // that asked for it — it goes on the tail and runs between turns.
      const compactTool = makeCompactTool({
        getAgent: () => sess.agent,
        schedule: (run) => {
          // The stream stays open on this flag (server.ts), so the compaction is
          // visible in the page as it happens instead of on the next turn.
          sess.compacting = true;
          sess.tail = sess.tail
            .then(run)
            .catch((err) => {
              dbg(sess.id, "compact error", String(err));
              this.appendError(sess, "compact_error", String(err));
            })
            .finally(() => {
              // Backstop: compaction_end clears it too. If pi ever throws before
              // emitting one, the flag must not strand the stream open.
              sess.compacting = false;
            });
        },
      });
      const { session } = await createAgentSession({
        cwd,
        modelRuntime: this.modelRuntime,
        resourceLoader: loader,
        sessionManager,
        settingsManager: settings,
        // Omitted entirely when nothing chose one: not passing it is what makes
        // pi's settings the decision.
        ...(model
          ? {
              model,
              ...(recorded?.thinkingLevel
                ? { thinkingLevel: recorded.thinkingLevel as any }
                : {}),
            }
          : {}),
        // Capability surface: read/grep/find/ls + bash (execution, including
        // HTTP via curl) + write/edit. External CLIs run through bash. ask_user
        // is every session's custom tool; the workspace tools belong to main
        // alone (a blueprint's page is a view, not a workspace).
        tools: [
          "read",
          "grep",
          "find",
          "ls",
          "bash",
          "write",
          "edit",
          "ask_user",
          "model",
          "usage",
          "compact",
          ...(kind === "main" ? WORKSPACE_TOOLS : []),
        ],
        customTools: [
          askUserTool,
          modelTool,
          usageTool,
          compactTool,
          ...(kind === "main"
            ? makeWorkspaceTools({
                logBase: this.opts.logBase,
                newSession: async (blueprint: string, project: string, model?: string) =>
                  (await this.new(blueprint, "sub", project, model ?? "")).id,
                newMainSession: async () => (await this.new(undefined, "main")).id,
                resumeSession: async (id: string) => {
                  if (!(await this.resume(id))) {
                    throw new Error("nothing on record to resume");
                  }
                },
                deleteSession: (id: string) => this.deleteSession(id),
              })
            : []),
        ],
      });
      sess.agent = session;
      session.subscribe((ev) => {
        dbg(
          sess.id,
          "pi",
          ev.type,
          ev.type === "message_update" ? ev.assistantMessageEvent?.type : "",
        );
        if (
          ev.type === "message_update" &&
          ev.assistantMessageEvent?.type === "text_delta"
        ) {
          sess.turnText += ev.assistantMessageEvent.delta;
          sess.runText += ev.assistantMessageEvent.delta;
        }
        if (ev.type === "agent_settled") {
          sess.sawSettled = true;
          sess.active = false;
          // Decided here, before the event is forwarded: the stream keeps itself
          // open past agent_settled when more of this turn is still coming, and
          // the name is one of those things.
          if (this.titleDue(sess)) sess.titling = true;
        }
        // Compaction is the one thing that can happen after the run settled;
        // its end is what makes the session idle again.
        if (ev.type === "compaction_end") sess.compacting = false;
        // Persist assistant / tool-result messages and compaction entries as
        // they complete. User messages are recorded by ask().
        if (ev.type === "message_end") this.recordMessage(sess, ev.message);
        if (ev.type === "compaction_end" && ev.result) {
          this.recordCompaction(sess, ev.result);
        }
        // Passthrough: forward the native pi event unmodified.
        this.append(sess, ev);
      });
    }
    this.sessions.set(sess.id, sess);
    return sess;
  }

  // toAgentMessage converts a stored record back into a pi AgentMessage so a
  // resumed session carries the prior conversation as LLM context. New rows
  // carry the raw pi message (images externalized as refs, re-inlined here);
  // legacy rows carry only text/image blocks and are reconstructed — `legacy` is
  // the last api/provider/model this session really used.
  private toAgentMessage(
    m: StoredRecord,
    legacy: { api?: string; provider?: string; model?: string } = {},
  ): any {
    // A model switch is stored where a rebuild can find it, not replayed as
    // something the model said.
    if (m.role === "model") return undefined;
    if (m.raw) {
      if (m.role === "compaction") {
        return {
          role: "compactionSummary",
          summary: String(m.raw.summary ?? ""),
          tokensBefore: Number(m.raw.tokensBefore ?? 0),
          timestamp: Number(m.raw.timestamp ?? Date.now()),
        };
      }
      return inlineImages(m.raw, (sha) => loadImage(this.opts.home, sha));
    }
    const blocks: any[] =
      m.blocks && m.blocks.length
        ? m.blocks
        : m.content.trim()
          ? [{ type: "text", text: m.content }]
          : [];
    const timestamp = Date.now();
    if (m.role === "assistant") {
      const text = blocks
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n");
      if (!text.trim()) return undefined;
      return {
        role: "assistant",
        content: [{ type: "text", text }],
        api: legacy.api ?? "openai-completions",
        provider: legacy.provider ?? "unknown",
        model: legacy.model ?? "unknown",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp,
      };
    }
    const content: any[] = [];
    for (const b of blocks) {
      if (b.type === "text") {
        if (b.text) content.push({ type: "text", text: b.text });
      } else if (b.type === "image" && b.sha256) {
        const img = loadImage(this.opts.home, b.sha256);
        if (img) content.push({ type: "image", data: img.data, mimeType: img.mimeType });
      }
    }
    if (!content.length) return undefined;
    return { role: "user", content, timestamp };
  }

  get(id: string): Sess | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): boolean {
    const sess = this.sessions.get(id);
    if (!sess) return false;
    sess.agent?.dispose();
    this.sessions.delete(id);
    return true;
  }

  // titleDue is the schedule: the 1st, 11th, 21st … user turn of a blueprint
  // agent. main is skipped — the shell draws its tab as "main" whatever the row
  // says. Asked at settle, so the flag is already up when the stream decides
  // whether agent_settled is the last thing it will send.
  private titleDue(sess: Sess): boolean {
    if (sess.kind !== "sub") return false;
    if (this.stub || !sess.agent) return false;
    return sess.turns >= 1 && (sess.turns - 1) % TITLE_EVERY === 0;
  }

  // maybeTitle runs the title call the schedule asked for. The work is out of
  // band: not on the tail chain (a name must never be what makes the next answer
  // late), one at a time per session, and its result goes out as one event —
  // `session_title` — which is also what lets the run's stream close, since it
  // was kept open for exactly this.
  private maybeTitle(sess: Sess): void {
    if (!sess.titling) return;
    const turns = sess.turns;
    void this.generateTitle(sess, turns)
      .catch((err) => dbg(sess.id, "title error", String(err)))
      .finally(() => {
        sess.titling = false;
        // Always: an unchanged name (or a failed call) still has to tell the
        // stream — and the tab bar — that this turn is over.
        this.append(sess, { type: "session_title", title: sess.title });
      });
  }

  // generateTitle asks this session's own model for a name, from the prose of the
  // conversation. The call is out of band in every direction: pi's session is not
  // prompted, no record is written, no event is emitted, and the run that just
  // settled is over. Only the session row learns anything.
  private async generateTitle(sess: Sess, turns: number): Promise<void> {
    const model = sess.agent?.model;
    if (!model || !this.modelRuntime) return;
    const startedAt = Date.now();
    // This turn's records are still queued for writing; the answer to name is
    // the last row of them.
    await drainRecords();
    const material = titleMaterial(await fetchRecords(this.opts.logBase, sess.id), turns);
    if (material.trim().length < 8) return; // nothing worth naming
    const reply = await this.modelRuntime.completeSimple(
      model,
      {
        systemPrompt: TITLE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: material, timestamp: Date.now() }],
      },
      {
        // A name is not a reasoning task, and this call is on the clock (the
        // turn's stream is open until it returns): no thinking budget is
        // requested at all — `reasoning` omitted is the "off" position at this
        // layer, since every level above it only *adds* a budget — the answer
        // ceiling is small enough that a thinking model cannot ruminate inside
        // it, and there is one attempt, not a retry ladder.
        maxTokens: 64,
        // Same conversation, same name: this is not a creative task.
        temperature: TITLE_TEMPERATURE,
        maxRetries: 1,
        // Bounded anyway: a provider that never answers must not hold a page
        // hostage. A timed-out name is no name.
        signal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
      },
    );
    const text = Array.isArray(reply?.content)
      ? reply.content
          .filter((b: any) => b?.type === "text" && b.text)
          .map((b: any) => String(b.text))
          .join(" ")
      : "";
    const title = cleanTitle(text);
    if (!title || title === sess.title) return;
    await this.upsertSession({ sessionId: sess.id, kind: sess.kind, title });
    sess.title = title;
    dbg(sess.id, "title", `${Date.now() - startedAt}ms`, title);
  }

  // persistModel remembers a `model` tool switch where a rebuild will find it: a
  // `model` record in this conversation (the source of truth — build reads the
  // last one) and the session row's mirror (what a list shows without reading
  // records). A failed row write is not worth failing the switch itself.
  private persistModel(sess: Sess, choice: { model: string; thinkingLevel: string }): void {
    this.recordRaw(sess, "model", "", {
      role: "model",
      model: choice.model,
      thinkingLevel: choice.thinkingLevel,
      timestamp: Date.now(),
    });
    void this.upsertSession({ sessionId: sess.id, kind: sess.kind, model: choice.model }).catch(
      (err) => {
        console.error(
          `engineer ai: session row model write failed sessionId=${sess.id}: ${String(err)}`,
        );
      },
    );
  }

  // ask feeds a prompt to the session. If a run is already streaming, the
  // prompt is steered into it (delivered after the current turn's tools finish,
  // before the next LLM call) and the in-flight run stays the sole owner of the
  // terminal agent_settled event. Otherwise a fresh run is started, serialized
  // on the tail chain so two idle asks cannot race.
  ask(sess: Sess, incoming: IncomingBlock[]): void {
    // `content` is pi-shaped user content (text blocks; images as sha refs);
    // `piImages` re-inlines the base64 bytes for the prompt call.
    const content: any[] = [];
    const piImages: any[] = [];
    let text = "";
    for (const b of incoming) {
      if (b.type === "text") {
        if (!b.text) continue;
        content.push({ type: "text", text: b.text });
        text += b.text;
      } else if (b.type === "image" && b.data && b.mimeType) {
        let ref: { sha256: string; size: number };
        try {
          ref = saveImage(this.opts.home, b.data, b.mimeType);
        } catch (err) {
          this.appendError(sess, "image_error", String(err));
          continue;
        }
        content.push({
          type: "image",
          sha256: ref.sha256,
          mimeType: b.mimeType,
          size: ref.size,
        });
        piImages.push({ type: "image", data: b.data, mimeType: b.mimeType });
        text += "[image]";
      }
    }
    const projection = content
      .map((b) => (b.type === "image" ? "[image]" : b.text))
      .join("");
    // A user turn is what the title schedule counts, and every recorded user
    // message is one — including a steered prompt, which is also a message.
    sess.turns++;
    this.recordRaw(sess, "user", projection, {
      role: "user",
      content,
      timestamp: Date.now(),
    });
    // A steered prompt joins the run in flight; anything else starts a new run.
    if (sess.agent?.isStreaming) {
      sess.runText = sess.runText ? `${sess.runText}\n${projection}` : projection;
    } else {
      sess.runText = projection;
    }
    // pi always emits a text block before images; avoid an empty one.
    const promptText = text || "[image]";
    if (!sess.agent) {
      const reply = `Corazon Engineer AI (dev stub) received your prompt:\n\n> ${promptText}`;
      sess.runText = [sess.runText, reply].filter(Boolean).join("\n");
      this.append(sess, { type: "agent_start" });
      this.append(sess, {
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: reply,
        },
      });
      this.append(sess, { type: "agent_settled" });
      this.recordRaw(sess, "assistant", reply, {
        role: "assistant",
        content: [{ type: "text", text: reply }],
        timestamp: Date.now(),
      });
      return;
    }
    const agent = sess.agent;
    const imageOpts = piImages.length ? { images: piImages } : {};
    if (agent.isStreaming) {
      sess.active = true;
      void agent
        .prompt(promptText, { ...imageOpts, streamingBehavior: "steer" })
        .catch((err) => {
          this.appendError(sess, "ai_error", String(err));
        });
      return;
    }
    // Mark active before scheduling so a client that subscribes immediately
    // after /ai/ask sees the run as in flight (the microskill may not have run).
    sess.active = true;
    sess.tail = sess.tail.then(() =>
      this.runTurn(sess, agent, promptText, piImages),
    );
  }

  // stop aborts the in-flight run. pi emits its terminal agent_settled as part
  // of the abort, so any live SSE stream closes normally. Idle sessions are a
  // no-op; the dev stub has no agent.
  async stop(sess: Sess): Promise<void> {
    if (!sess.agent) return;
    await sess.agent.abort();
  }

  private async runTurn(
    sess: Sess,
    agent: AgentSession,
    prompt: string,
    images: any[] = [],
  ): Promise<void> {
    sess.turnText = "";
    sess.sawSettled = false;
    dbg(sess.id, "runTurn start", prompt.slice(0, 60));
    try {
      // runTurn only runs when idle (ask() steers instead while streaming), so
      // prompt() starts the run and resolves after it fully settles, including
      // retries and any messages steered in during the run.
      await agent.prompt(prompt, images.length ? { images } : undefined);
    } catch (err) {
      dbg(sess.id, "runTurn error", String(err));
      this.appendError(sess, "ai_error", String(err));
    } finally {
      // pi emits agent_settled itself on a normal run; synthesize one if the
      // run never started (e.g. preflight threw) so the SSE stream still closes.
      if (!sess.sawSettled) this.append(sess, { type: "agent_settled" });
      sess.active = false;
      // Naming the conversation is scheduled here, after the run: this turn's
      // answer has to be part of the material.
      this.maybeTitle(sess);
    }
  }

  // subscribe returns the backlog and registers a live listener.
  subscribe(sess: Sess, listener: Listener): EngineerEvent[] {
    sess.listeners.add(listener);
    return [...sess.events];
  }

  unsubscribe(sess: Sess, listener: Listener): void {
    sess.listeners.delete(listener);
  }

  private append(sess: Sess, ev: { type: string; [key: string]: unknown }): void {
    const full = { seq: sess.events.length + 1, ...ev } as EngineerEvent;
    sess.events.push(full);
    for (const l of sess.listeners) l(full);
  }

  // Non-pi error event, reusing pi's assistant-error shape { type, reason, error }.
  private appendError(sess: Sess, code: string, message: string): void {
    this.append(sess, {
      type: "error",
      reason: "error",
      error: { code, message },
    });
  }

  // recordMessage persists an assistant / toolResult pi message from a
  // message_end event (user messages are recorded by ask()).
  private recordMessage(sess: Sess, message: any): void {
    const role = String(message?.role ?? "");
    if (role !== "assistant" && role !== "toolResult") return;
    const stored = externalizeImages(message, (data, mime) =>
      saveImage(this.opts.home, data, mime),
    );
    this.recordRaw(sess, role, projectText(role, stored), stored);
  }

  // recordCompaction persists a compaction entry so a resumed session honors the
  // summary and does not re-send the summarized history to the provider.
  private recordCompaction(sess: Sess, result: any): void {
    this.recordRaw(
      sess,
      "compaction",
      "",
      {
        role: "compaction",
        summary: String(result?.summary ?? ""),
        firstKeptEntryId: result?.firstKeptEntryId,
        tokensBefore: result?.tokensBefore,
        usage: result?.usage,
        details: result?.details,
        timestamp: Date.now(),
      },
    );
  }

  private recordRaw(
    sess: Sess,
    role: string,
    content: string,
    raw: unknown,
  ): void {
    record(
      this.opts.logBase,
      sess.id,
      ++sess.recordSeq,
      role,
      content,
      raw,
    );
  }
}

// The text that stands in for a tool result whose record never made it to the
// log. It is replayed to the model but never written back: the real output is
// gone, and a fabricated row in the log would outlive the repair.
const LOST_RESULT_TEXT =
  "[record lost: this tool call's result was never persisted]";

// sanitizeHistory makes a stored conversation safe to replay to a provider.
//
// A record can go missing (a write that failed while seq was already handed out,
// see recorder.record), and what survives is then malformed: a `toolResult` whose
// assistant is gone, or an assistant `toolCall` with no result. Providers reject
// both — DeepSeek: `An assistant message with 'tool_calls' must be followed by
// tool messages responding to each 'tool_call_id'` — and because a session
// replays its whole history on every prompt, one bad record wedges that
// conversation forever. Rather than trusting the log, the replay rebuilds a shape
// the provider accepts:
//
//   - the same `seq` twice (a retried write landing twice) keeps its first row;
//   - an assistant's tool calls are answered in call order, in a placeholder
//     when the result is missing;
//   - a `toolResult` nobody asked for is dropped.
//
// It also counts the `seq` numbers that are missing from what is stored, which
// reports how many records were lost. Nothing is written back; the repair is a
// memory-side view of the same records.
function sanitizeHistory(
  sessionId: string,
  history: StoredRecord[],
): StoredRecord[] {
  let duplicates = 0;
  let filled = 0;
  let orphans = 0;

  // 1. Keep the first row per seq (a retried write can insert the same seq
  // twice), and collect the seq numbers actually present. Rows with no seq are
  // legacy and carry no ordering information to de-duplicate on.
  //
  // `model` rows are metadata, not messages: they say which model the session was
  // switched to, they are read before this runs (lastModelChoice), and they are
  // dropped here. They are written *during* a tool call — between the assistant
  // message that asked for it and the result that answers it — so keeping them
  // would break the pairing below and turn a real tool result into an orphan.
  // Their seq still counts as present, so a dropped write is still reported.
  const deduped: StoredRecord[] = [];
  const seqs = new Set<number>();
  const seen = new Set<number>();
  for (const r of history) {
    if (r.seq > 0) {
      seqs.add(r.seq);
      if (seen.has(r.seq)) {
        duplicates++;
        dbg(sessionId, "repair", "drop-duplicate", `seq=${r.seq}`);
        continue;
      }
      seen.add(r.seq);
    }
    if (r.role === "model") continue;
    deduped.push(r);
  }
  // A hole is a number no row ever claimed: a write that was lost for good.
  const ordered = [...seqs].sort((a, b) => a - b);
  let holes = 0;
  for (let i = 1; i < ordered.length; i++) {
    holes += Math.max(0, ordered[i] - ordered[i - 1] - 1);
  }

  // 2. Rebuild tool-call pairing. The window for an assistant's results is the
  // run of `toolResult` rows right after it — exactly the shape providers
  // require, and the only window in which a result can be matched.
  const out: StoredRecord[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const r = deduped[i];
    const calls = toolCallsOf(r);
    if (calls.length) {
      out.push(r);
      const results = new Map<string, StoredRecord>();
      let j = i + 1;
      while (j < deduped.length && deduped[j].role === "toolResult") {
        const id = String((deduped[j].raw as any)?.toolCallId ?? "");
        if (!calls.some((c) => c.id === id) || results.has(id)) break;
        results.set(id, deduped[j]);
        j++;
      }
      i = j - 1;
      for (const call of calls) {
        const hit = results.get(call.id);
        if (hit) {
          out.push(hit);
          continue;
        }
        filled++;
        dbg(sessionId, "repair", "fill", `seq=${r.seq}`, `toolCallId=${call.id}`);
        out.push({
          seq: r.seq,
          role: "toolResult",
          content: "",
          raw: {
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            content: [{ type: "text", text: LOST_RESULT_TEXT }],
            isError: false,
            timestamp: Date.now(),
          },
        });
      }
      continue;
    }
    if (r.role === "toolResult") {
      orphans++;
      dbg(
        sessionId,
        "repair",
        "drop-orphan",
        `seq=${r.seq}`,
        `toolCallId=${String((r.raw as any)?.toolCallId ?? "")}`,
      );
      continue;
    }
    out.push(r);
  }

  if (duplicates || filled || orphans || holes) {
    console.error(
      `engineer ai: history repair ${sessionId}: filled=${filled}` +
        ` orphans=${orphans} duplicates=${duplicates} holes=${holes}`,
    );
  }
  return out;
}

// toolCallsOf returns the tool calls a stored record makes, in call order. Only
// assistant records carrying a raw pi message with a content array have them;
// legacy rows (text/image blocks) and compaction entries make none.
function toolCallsOf(r: StoredRecord): { id: string; name: string }[] {
  if (r.role !== "assistant" || !Array.isArray(r.raw?.content)) return [];
  return r.raw.content
    .filter((b: any) => b?.type === "toolCall" && b.id)
    .map((b: any) => ({ id: String(b.id), name: String(b.name ?? "") }));
}

// lastModelChoice is the model a conversation was last switched to: the newest
// `model` record in its history. Those rows are the persisted side of the
// `model` tool — not messages, so they are never replayed to the model, only
// read back to decide what the rebuilt session runs.
function lastModelChoice(
  records: StoredRecord[],
): { model: string; thinkingLevel?: string } | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.role !== "model") continue;
    const model = String(r.raw?.model ?? "").trim();
    if (!model) continue;
    const thinkingLevel = String(r.raw?.thinkingLevel ?? "").trim();
    return thinkingLevel ? { model, thinkingLevel } : { model };
  }
  return undefined;
}

// lastCompactionIndex returns the index of the latest compaction record, or 0
// when there is none, so context rebuild starts right after the summary.
function lastCompactionIndex(records: StoredRecord[]): number {
  let idx = 0;
  for (let i = 0; i < records.length; i++) {
    if (records[i].role === "compaction") idx = i;
  }
  return idx;
}
