import { randomBytes } from "node:crypto";
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
import { loadImage, saveImage } from "./blobs.ts";
import { dbg } from "./debug.ts";
import { SkillStore } from "./skill/store.ts";
import { BlueprintError, BlueprintStore, type BlueprintFile } from "./blueprint/store.ts";
import {
  SCAN_THRESHOLD,
  Suggester,
  type ScanResult,
} from "./skill/suggest.ts";

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

// ask_user: one of the three custom tools (save_skill and save_blueprint are
// built further down). It does not block: it ends the current run and the user's
// answer is injected later as a normal user text turn (via the dedicated
// /ai/answer endpoint, which will also host permission logic).
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
  agent?: AgentSession; // undefined in stub mode (no API key)
  events: EngineerEvent[];
  listeners: Set<Listener>;
  tail: Promise<void>; // serializes prompts within the session
  turnText: string; // accumulated assistant text of the in-flight run
  // Text of the whole run (user turns + assistant prose, never tool traffic),
  // queued for the suggestion scan when the run settles.
  runText: string;
  turns: number; // turns elapsed in the in-flight prompt (loop cap)
  recordSeq: number;
  sawSettled: boolean; // whether pi emitted agent_settled for the current run
  active: boolean; // a run is scheduled or in flight (used by resume/stream)
}

// pi's agent loop has no built-in round cap; stop a runaway turn loop
// gracefully after this many turns.
const MAX_TURNS = 100;

// Default model when --model is not given: DeepSeek Flash.
const DEFAULT_MODEL = "deepseek/deepseek-flash";

export interface RegistryOptions {
  root: string;
  logBase: string;
  systemPrompt: string;
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
  private loader?: DefaultResourceLoader;
  private settings = SettingsManager.inMemory();
  private skillStore?: SkillStore;
  private suggester?: Suggester;
  private skillTool?: ReturnType<typeof defineTool>;
  private blueprintStore?: BlueprintStore;
  private blueprintTool?: ReturnType<typeof defineTool>;

  constructor(private opts: RegistryOptions) {}

  // init resolves the model. Any pi-supported provider works; without any
  // authenticated provider it falls back to the dev echo stub.
  async init(): Promise<void> {
    // The skill system is independent of the model: CRUD and the run queue work
    // without one; only the suggestion scan needs a model (and falls back to a
    // deterministic stub when there is none).
    this.skillStore = new SkillStore(this.opts.root);
    this.suggester = new Suggester({
      store: this.skillStore,
      oneShot: (prompt) => this.oneShot(prompt),
      inputBudgetTokens: () => this.scanBudget(),
    });
    this.skillTool = this.buildSkillTool();
    // Blueprints are the pages' classes — plain files in the project, no scan.
    this.blueprintStore = new BlueprintStore(this.opts.root);
    this.blueprintTool = this.buildBlueprintTool();
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
    if (!this.model) return; // stub mode
    this.loader = new DefaultResourceLoader({
      cwd: this.opts.root,
      agentDir: getAgentDir(),
      // Append AGENTS.md instead of overriding the system prompt: pi only emits
      // its "Available tools" list (which is where custom tools like ask_user
      // surface) when the system prompt is not fully replaced.
      appendSystemPromptOverride: (base) => [...base, this.opts.systemPrompt],
    });
    await this.loader.reload();
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

  // --- skill system ---

  // Saving a skill is itself an agent capability: the user describes a skill in
  // conversation and the agent stores it. A skill is only a name plus a piece of
  // text, so this is the whole of the create path.
  private buildSkillTool(): ReturnType<typeof defineTool> {
    return defineTool({
      name: "save_skill",
      label: "Save skill",
      description:
        "Save a reusable skill. A skill is a single piece of text: running it opens " +
        "a fresh conversation and hands that text to the agent as the first " +
        "message. Use this when the user asks to remember or save something as a " +
        "skill / shortcut.",
      promptSnippet: "save_skill: save a reusable skill (name + text)",
      parameters: Type.Object({
        name: Type.String({ description: "Short label for the skill" }),
        text: Type.String({
          description:
            "The skill itself: a self-contained instruction handed to the agent when the skill runs",
        }),
      }),
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const name = String(params.name ?? "").trim();
        const text = String(params.text ?? "").trim();
        if (!name || !text) {
          return {
            content: [{ type: "text", text: "name and text are both required." }],
            details: undefined,
          };
        }
        const skill = this.skillStore?.save({ name, text });
        if (!skill) {
          return {
            content: [{ type: "text", text: "could not save the skill." }],
            details: undefined,
          };
        }
        return {
          content: [
            { type: "text", text: `Saved skill ${skill.id} ("${skill.name}").` },
          ],
          details: { skillId: skill.id, name: skill.name, text: skill.text },
        };
      },
    });
  }

  get skills(): SkillStore {
    if (!this.skillStore) throw new Error("skill store not initialized");
    return this.skillStore;
  }

  // --- blueprint system ---

  // A blueprint is the class behind a page. Writing one is itself an agent
  // capability — the user describes the page in conversation and the agent lays
  // it down as files — and it is the *only* way blueprints come to exist: unlike
  // skills there is no discovery, no queue and no sqlite to accept or ignore.
  private buildBlueprintTool(): ReturnType<typeof defineTool> {
    return defineTool({
      name: "save_blueprint",
      label: "Save blueprint",
      description:
        "Save a page blueprint: a frontend resource the user can open as a page " +
        "tab in the launcher. A blueprint is a directory in the project holding " +
        "one html entry (index.html) plus any files it needs — js, css, images, " +
        "subdirectories. Pass every file the page needs, index.html included; " +
        "files you do not pass are left untouched. Give it a <title>: that is the " +
        "name the user sees.",
      promptSnippet: "save_blueprint: save a page blueprint (name + files)",
      parameters: Type.Object({
        name: Type.String({ description: "Short label for the blueprint" }),
        files: Type.Array(
          Type.Object({
            path: Type.String({
              description:
                'Path inside the blueprint directory, e.g. "index.html" or "app.js"; must include index.html',
            }),
            content: Type.String({ description: "The file's text" }),
          }),
          { description: "The files that make up the blueprint" },
        ),
        id: Type.Optional(
          Type.String({
            description:
              "An existing blueprint id to write into; omit to create a new one",
          }),
        ),
      }),
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const name = String(params.name ?? "").trim();
        const files = (Array.isArray(params.files) ? params.files : []).map(
          (f: any): BlueprintFile => ({
            path: String(f?.path ?? ""),
            content: String(f?.content ?? ""),
          }),
        );
        const id = params.id ? String(params.id) : undefined;
        try {
          const bp = this.blueprintStore!.save({ id, name, files });
          return {
            content: [
              {
                type: "text",
                text: `Saved blueprint ${bp.id} ("${bp.name}"): ${bp.files.join(", ")}`,
              },
            ],
            details: { blueprintId: bp.id, name: bp.name, files: bp.files },
          };
        } catch (err) {
          if (err instanceof BlueprintError) {
            return {
              content: [{ type: "text", text: err.message }],
              details: undefined,
            };
          }
          throw err;
        }
      },
    });
  }

  get blueprints(): BlueprintStore {
    if (!this.blueprintStore) throw new Error("blueprint store not initialized");
    return this.blueprintStore;
  }

  // scanSkills runs one suggestion scan. The automatic path is fire-and-forget;
  // this is the manual one behind /ai/skill/refresh.
  async scanSkills(force = false): Promise<ScanResult> {
    if (!this.suggester) return { triggered: false, scanned: 0 };
    return this.suggester.maybeScan({ force });
  }

  private scanBudget(): number {
    const cw = Number((this.model as any)?.contextWindow ?? 0);
    if (!cw) return 8000;
    return Math.max(2000, cw - 24000);
  }

  // oneShot is a single non-streaming model call outside any user session: no
  // tools, no history, nothing recorded. Used by the suggestion scan.
  private async oneShot(prompt: string): Promise<string | undefined> {
    if (!this.model || !this.modelRuntime) return undefined;
    const sessionManager = SessionManager.inMemory(this.opts.root);
    const settings = SettingsManager.inMemory({
      compaction: { enabled: false, reserveTokens: 0, keepRecentTokens: 0 },
    });
    const { session } = await createAgentSession({
      cwd: this.opts.root,
      model: this.model,
      modelRuntime: this.modelRuntime,
      sessionManager,
      settingsManager: settings,
      noTools: "all",
    });
    let out = "";
    session.subscribe((ev) => {
      if (
        ev.type === "message_update" &&
        ev.assistantMessageEvent?.type === "text_delta"
      ) {
        out += ev.assistantMessageEvent.delta;
      }
    });
    try {
      await session.prompt(prompt);
    } finally {
      session.dispose();
    }
    return out;
  }

  async new(): Promise<Sess> {
    return this.build(`s_${randomBytes(8).toString("hex")}`);
  }

  // resume rebuilds a session that is no longer in memory from its log records.
  // Returns undefined when the id has no live session and no recorded history.
  async resume(id: string): Promise<Sess | undefined> {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    const history = await fetchRecords(this.opts.logBase, id);
    if (!history.length) return undefined;
    return this.build(id, history);
  }

  private async build(
    id: string,
    history: StoredRecord[] = [],
  ): Promise<Sess> {
    const sess: Sess = {
      id,
      events: [],
      listeners: new Set(),
      tail: Promise.resolve(),
      turnText: "",
      runText: "",
      turns: 0,
      // Continue the recorder's per-session sequence after a resume.
      recordSeq: history.reduce((max, m) => Math.max(max, m.seq), 0),
      sawSettled: false,
      active: false,
    };
    if (this.model) {
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
        resourceLoader: this.loader,
        sessionManager,
        settingsManager: this.settings,
        // Capability surface: read/grep/find/ls + bash (execution, including
        // HTTP via curl) + write/edit. External CLIs run through bash. ask_user,
        // save_skill and save_blueprint are the custom tools and must be in the
        // allowlist to stay enabled.
        tools: [
          "read",
          "grep",
          "find",
          "ls",
          "bash",
          "write",
          "edit",
          "ask_user",
          "save_skill",
          "save_blueprint",
        ],
        customTools: [
          askUserTool,
          ...(this.skillTool ? [this.skillTool] : []),
          ...(this.blueprintTool ? [this.blueprintTool] : []),
        ],
      });
      sess.agent = session;
      session.agent.shouldStopAfterTurn = () => ++sess.turns >= MAX_TURNS;
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

  // answer injects the user's reply to an ask_user question as a normal user
  // text turn. Kept separate from ask() so permission/approval logic for
  // ask_user can live on this path.
  answer(sess: Sess, text: string): void {
    this.ask(sess, [{ type: "text", text }]);
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
    sess.turns = 0;
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
    // A settled run becomes a suggestion-scan candidate. Hooked here (not in the
    // pi subscriber) because the dev stub settles through this same path.
    if (ev.type === "agent_settled") this.onRunSettled(sess);
  }

  // onRunSettled queues the run's text for the suggestion scan and fires a scan
  // once enough runs have piled up. It must never block or break a conversation:
  // queueing is one local sqlite write, and the scan itself runs as an
  // independent async task that never touches a user session.
  private onRunSettled(sess: Sess): void {
    const text = sess.runText.trim();
    sess.runText = "";
    if (!this.skillStore || !text) return;
    try {
      this.skillStore.enqueueRun(sess.id, text);
      if (this.skillStore.pendingCount() >= SCAN_THRESHOLD) {
        void this.suggester?.maybeScan();
      }
    } catch (err) {
      console.error(`engineer ai: skill queue failed: ${String(err)}`);
    }
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
