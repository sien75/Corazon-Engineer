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
import { record } from "./recorder.ts";
import { dbg } from "./debug.ts";

type Model = Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number];

// The SSE envelope sent to the frontend. It carries the native pi event as-is
// (passthrough) plus a per-session `seq`. A non-pi `error` event reuses the
// shape of pi's assistant-message error: { type, reason, error }.
export interface CorazonEvent {
  seq: number;
  type: string;
  [key: string]: unknown;
}

type Listener = (ev: CorazonEvent) => void;

// ask_user is the only custom tool. It does not block: it ends the current run
// and the user's answer is injected later as a normal user text turn (via the
// dedicated /ai/answer endpoint, which will also host permission logic).
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
  agent?: AgentSession; // undefined in stub mode (no API key)
  events: CorazonEvent[];
  listeners: Set<Listener>;
  tail: Promise<void>; // serializes prompts within the session
  turnText: string; // accumulated assistant text of the in-flight run
  turns: number; // turns elapsed in the in-flight prompt (loop cap)
  recordSeq: number;
  sawSettled: boolean; // whether pi emitted agent_settled for the current run
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

  constructor(private opts: RegistryOptions) {}

  // init resolves the model. Any pi-supported provider works; without any
  // authenticated provider it falls back to the dev echo stub.
  async init(): Promise<void> {
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
    if (!this.model) return; // stub mode
    this.loader = new DefaultResourceLoader({
      cwd: this.opts.root,
      agentDir: getAgentDir(),
      systemPromptOverride: () => this.opts.systemPrompt,
    });
    await this.loader.reload();
  }

  get stub(): boolean {
    return !this.model;
  }

  get modelInfo(): string {
    return this.model ? `${this.model.provider}/${this.model.id}` : "stub";
  }

  async new(): Promise<Sess> {
    const sess: Sess = {
      id: `s_${randomBytes(8).toString("hex")}`,
      events: [],
      listeners: new Set(),
      tail: Promise.resolve(),
      turnText: "",
      turns: 0,
      recordSeq: 0,
      sawSettled: false,
    };
    if (this.model) {
      const { session } = await createAgentSession({
        cwd: this.opts.root,
        model: this.model,
        modelRuntime: this.modelRuntime,
        resourceLoader: this.loader,
        sessionManager: SessionManager.inMemory(this.opts.root),
        settingsManager: this.settings,
        // Capability surface: read/grep/find/ls + bash (execution, including
        // HTTP via curl) + write/edit. External CLIs run through bash. ask_user
        // is the one custom tool and must be in the allowlist to stay enabled.
        tools: ["read", "grep", "find", "ls", "bash", "write", "edit", "ask_user"],
        customTools: [askUserTool],
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
        }
        if (ev.type === "agent_settled") sess.sawSettled = true;
        // Passthrough: forward the native pi event unmodified.
        this.append(sess, ev);
      });
    }
    this.sessions.set(sess.id, sess);
    return sess;
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
  ask(sess: Sess, prompt: string): void {
    this.record(sess, "user", prompt);
    if (!sess.agent) {
      const reply = `Corazon AI (dev stub) received your prompt:\n\n> ${prompt}`;
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
      this.record(sess, "assistant", reply);
      return;
    }
    const agent = sess.agent;
    if (agent.isStreaming) {
      void agent
        .prompt(prompt, { streamingBehavior: "steer" })
        .catch((err) => {
          this.appendError(sess, "ai_error", String(err));
        });
      return;
    }
    sess.tail = sess.tail.then(() => this.runTurn(sess, agent, prompt));
  }

  // answer injects the user's reply to an ask_user question as a normal user
  // text turn. Kept separate from ask() so permission/approval logic for
  // ask_user can live on this path.
  answer(sess: Sess, text: string): void {
    this.ask(sess, text);
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
  ): Promise<void> {
    sess.turnText = "";
    sess.turns = 0;
    sess.sawSettled = false;
    dbg(sess.id, "runTurn start", prompt.slice(0, 60));
    try {
      // runTurn only runs when idle (ask() steers instead while streaming), so
      // prompt() starts the run and resolves after it fully settles, including
      // retries and any messages steered in during the run.
      await agent.prompt(prompt);
    } catch (err) {
      dbg(sess.id, "runTurn error", String(err));
      this.appendError(sess, "ai_error", String(err));
    } finally {
      // pi emits agent_settled itself on a normal run; synthesize one if the
      // run never started (e.g. preflight threw) so the SSE stream still closes.
      if (!sess.sawSettled) this.append(sess, { type: "agent_settled" });
      this.record(sess, "assistant", sess.turnText);
    }
  }

  // subscribe returns the backlog and registers a live listener.
  subscribe(sess: Sess, listener: Listener): CorazonEvent[] {
    sess.listeners.add(listener);
    return [...sess.events];
  }

  unsubscribe(sess: Sess, listener: Listener): void {
    sess.listeners.delete(listener);
  }

  private append(sess: Sess, ev: { type: string; [key: string]: unknown }): void {
    const full = { seq: sess.events.length + 1, ...ev } as CorazonEvent;
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

  private record(sess: Sess, msgKind: string, content: string): void {
    record(this.opts.logBase, sess.id, ++sess.recordSeq, msgKind, content);
  }
}
