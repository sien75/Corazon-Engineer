import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
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
  resolveCliModel,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import {
  record,
  fetchRecords,
  externalizeImages,
  inlineImages,
  projectText,
  type StoredRecord,
} from "./recorder.ts";
import { blueprintTitle, blueprintReadme, legacyAgentDir } from "./blueprint.ts";
import { makeWorkspaceTools } from "./workspace.ts";
import { loadImage, saveImage } from "./blobs.ts";
import { dbg } from "./debug.ts";

// The workspace tools main alone may call. Names are listed here because pi's
// allowlist is by name, not by tool object.
const WORKSPACE_TOOLS = [
  "session-list",
  "session-open",
  "session-close",
  "main-list",
  "main-new",
  "main-resume",
  "session-new",
  "session-delete",
];

// legacyReadme reads a session's old per-agent copy, if the project still has
// one. Blueprints are no longer copied, but a session created before that keeps
// its page and its README.
function legacyReadme(root: string, id: string): string | undefined {
  const file = path.join(legacyAgentDir(root, id), "README.md");
  if (!existsSync(file)) return undefined;
  return readFileSync(file, "utf8");
}

// pageLine is the last thing a sub agent is told: which directory its page lives
// in. The prompt carries the README; the path is what makes "change the page" an
// action rather than a wish.
function pageLine(slug?: string, legacyId?: string): string {
  if (slug) {
    return `Your page: \`.agents/blueprints/${slug}/\` — that directory is what /agent/<sessionId>/ serves, for every agent made from this blueprint. Edit its files (index.html and anything beside it) and ask the user to reload; the change lands in the project's working tree.`;
  }
  return `Your page: \`.engineer/agents/${legacyId}/\` — this agent's own copy of an older blueprint. Edit its files and ask the user to reload.`;
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

// pi's bundled catalog under-declares some vision models, and its
// openai-completions adapter silently strips images unless the model's declared
// `input` includes "image" (pi-ai: openai-completions.js). DeepSeek Flash
// supports vision (DeepSeek Vision guide). Only that exact provider/model is
// touched, and a copy is returned so the shared catalog object stays intact.
function withVisionCapability(model: Model | undefined): Model | undefined {
  if (!model) return model;
  const m = model as any;
  if (
    m.provider === "deepseek" &&
    /^deepseek-flash$/.test(m.id) &&
    Array.isArray(m.input) &&
    !m.input.includes("image")
  ) {
    return { ...m, input: [...m.input, "image"] };
  }
  return model;
}

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
}

// Default model when --model is not given: DeepSeek Flash.
const DEFAULT_MODEL = "deepseek/deepseek-flash";

export interface RegistryOptions {
  root: string;
  logBase: string;
  // The two role specs, already carrying the runtime endpoints. main gets the
  // workspace tools; sub gets its blueprint's README appended after this.
  specs: { main: string; sub: string };
  model?: string; // CLI model pattern, e.g. "deepseek/deepseek-chat" or "sonnet:high"
  forceStub?: boolean; // skip model resolution entirely (offline / tests)
}

// Registry owns all chat sessions. The agent loop itself is pi's
// (@earendil-works/pi-coding-agent SDK, in-process); this class subscribes to
// pi's AgentSession events and forwards them (native format) over SSE.
export class Registry {
  private sessions = new Map<string, Sess>();
  private modelRuntime?: ModelRuntime;
  private model?: Model;
  private settings = SettingsManager.inMemory();

  constructor(private opts: RegistryOptions) {}

  // init resolves the model. Any pi-supported provider works; without any
  // authenticated provider it falls back to the dev echo stub.
  async init(): Promise<void> {
    if (this.opts.forceStub) return; // dev stub forced (offline / tests)
    this.modelRuntime = await ModelRuntime.create();
    const requested = this.opts.model ?? DEFAULT_MODEL;
    const r = resolveCliModel({
      cliModel: requested,
      modelRuntime: this.modelRuntime,
    });
    if (r.warning) console.error(`warning: ${r.warning}`);
    if (r.error) {
      console.error(`warning: ${r.error}; falling back to auto selection`);
    } else {
      this.model = r.model;
    }
    if (!this.model) {
      const available = await this.modelRuntime.getAvailable();
      // Prefer any deepseek provider, otherwise take whatever is available.
      this.model =
        available.find((m) => m.provider === "deepseek") ?? available[0];
    }
    this.model = withVisionCapability(this.model);
  }

  // makeLoader builds the resource loader for one session's role. `tail` is
  // appended after everything else — a sub agent's blueprint README goes there,
  // so it reads as the last word on what this particular agent's UI is.
  private makeLoader(kind: "main" | "sub", tail?: string): DefaultResourceLoader {
    const spec = this.opts.specs[kind];
    return new DefaultResourceLoader({
      cwd: this.opts.root,
      agentDir: getAgentDir(),
      // Append the spec instead of overriding the system prompt: pi only emits
      // its "Available tools" list (which is where custom tools like ask_user
      // surface) when the system prompt is not fully replaced.
      appendSystemPromptOverride: (base) =>
        tail ? [...base, spec, tail] : [...base, spec],
    });
  }

  get stub(): boolean {
    return !this.model;
  }

  get rootDir(): string {
    return this.opts.root;
  }

  get modelInfo(): string {
    return this.model ? `${this.model.provider}/${this.model.id}` : "stub";
  }

  // new opens a conversation. kind="main" is the shell's own chat (no blueprint,
  // no page); kind="sub" is made from a blueprint: the prototype's README and the
  // path of its directory are appended to this session's system prompt — last,
  // after the role spec — so the model knows what its UI is and where it lives.
  // Nothing is copied: the web server serves the prototype itself, so the page
  // this agent edits is the page every agent of the same blueprint sees.
  async new(blueprint?: string, kind: "main" | "sub" = "sub"): Promise<Sess> {
    const id = `s_${randomBytes(8).toString("hex")}`;
    const readme = blueprint ? blueprintReadme(this.opts.root, blueprint) : undefined;
    const tail = blueprint ? `${readme ?? ""}\n\n${pageLine(blueprint)}` : undefined;
    await this.writeSession(id, kind, blueprint ?? "");
    return this.build(id, [], kind, tail);
  }

  // writeSession records what a conversation is — its role, the blueprint its page
  // comes from, and the name the tab bar shows. The name is the page's <title>
  // (resolved here, not by the page at runtime), so the shell can draw a tab
  // before it loads anything; log owns the row, and it is the only place the
  // mapping lives.
  private async writeSession(id: string, kind: "main" | "sub", blueprint: string): Promise<void> {
    const title = blueprint ? blueprintTitle(this.opts.root, blueprint) : "main";
    const res = await fetch(`${this.opts.logBase}/log/session/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: YAML.stringify({ sessionId: id, kind, blueprint, title }),
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
  ): Promise<{ kind: "main" | "sub"; blueprint: string } | undefined> {
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
        blueprint: String(data?.blueprint ?? ""),
      };
    } catch {
      return undefined;
    }
  }

  // deleteSession is the hard delete: the live session and its records. The page
  // is the blueprint's, shared with every other agent of it, so it stays.
  async deleteSession(id: string): Promise<void> {
    this.delete(id);
    // Older agents still have a copy of their own; delete it with the agent.
    rmSync(legacyAgentDir(this.opts.root, id), { recursive: true, force: true });
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
    // The page is the blueprint's, so its README is read from the prototype —
    // current, not frozen. A session with no blueprint (or one older than that
    // rule) falls back to whatever per-agent copy it still has.
    let tail: string | undefined;
    if (kind === "sub") {
      if (meta?.blueprint) {
        let readme: string | undefined;
        try {
          readme = blueprintReadme(this.opts.root, meta.blueprint);
        } catch {
          readme = undefined; // the prototype was deleted: the page is gone too
        }
        tail = `${readme ?? ""}\n\n${pageLine(meta.blueprint)}`;
      } else {
        tail = `${legacyReadme(this.opts.root, id) ?? ""}\n\n${pageLine(undefined, id)}`;
      }
    }
    return this.build(id, history, kind, tail);
  }

  private async build(
    id: string,
    history: StoredRecord[] = [],
    kind: "main" | "sub" = "sub",
    blueprintReadme?: string,
  ): Promise<Sess> {
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
    };
    if (this.model) {
      // The role's spec, plus (for a sub agent) its blueprint's README as the
      // tail, so it knows its own UI from the first turn.
      const loader = this.makeLoader(kind, blueprintReadme);
      await loader.reload();
      const sessionManager = SessionManager.inMemory(this.opts.root);
      // Rebuild context compaction-aware: the latest compaction summary plus the
      // records after it. Summarized history is not re-sent to the provider.
      // Repair runs *after* the slice: the cut is an index, so it can land
      // between an assistant and the tool results it asked for, and repairing
      // before it would leave the orphans the cut just made. A damaged history
      // that is replayed as-is is fatal rather than cosmetic — the provider
      // rejects the whole request, and every later prompt replays it again.
      const context = sanitizeHistory(id, history.slice(lastCompactionIndex(history)));
      for (const m of context) {
        const msg = this.toAgentMessage(m);
        if (msg) sessionManager.appendMessage(msg);
      }
      const { session } = await createAgentSession({
        cwd: this.opts.root,
        model: this.model,
        modelRuntime: this.modelRuntime,
        resourceLoader: loader,
        sessionManager,
        settingsManager: this.settings,
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
          ...(kind === "main" ? WORKSPACE_TOOLS : []),
        ],
        customTools: [
          askUserTool,
          ...(kind === "main"
            ? makeWorkspaceTools({
                logBase: this.opts.logBase,
                newSession: async (blueprint?: string) =>
                  (await this.new(blueprint, "sub")).id,
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
        }
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
  // legacy rows carry only text/image blocks and are reconstructed.
  private toAgentMessage(m: StoredRecord): any {
    if (m.raw) {
      if (m.role === "compaction") {
        return {
          role: "compactionSummary",
          summary: String(m.raw.summary ?? ""),
          tokensBefore: Number(m.raw.tokensBefore ?? 0),
          timestamp: Number(m.raw.timestamp ?? Date.now()),
        };
      }
      return inlineImages(m.raw, (sha) => loadImage(this.opts.root, sha));
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
      const model = this.model as any;
      return {
        role: "assistant",
        content: [{ type: "text", text }],
        api: model?.api ?? "openai-completions",
        provider: model?.provider ?? "unknown",
        model: model?.id ?? "unknown",
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
        const img = loadImage(this.opts.root, b.sha256);
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
          ref = saveImage(this.opts.root, b.data, b.mimeType);
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
      saveImage(this.opts.root, data, mime),
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
  const deduped: StoredRecord[] = [];
  const seqs = new Set<number>();
  for (const r of history) {
    if (r.seq > 0) {
      if (seqs.has(r.seq)) {
        duplicates++;
        dbg(sessionId, "repair", "drop-duplicate", `seq=${r.seq}`);
        continue;
      }
      seqs.add(r.seq);
    }
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

// lastCompactionIndex returns the index of the latest compaction record, or 0
// when there is none, so context rebuild starts right after the summary.
function lastCompactionIndex(records: StoredRecord[]): number {
  let idx = 0;
  for (let i = 0; i < records.length; i++) {
    if (records[i].role === "compaction") idx = i;
  }
  return idx;
}
