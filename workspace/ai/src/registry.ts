import { randomBytes } from "node:crypto";
import {
  createAgentSession,
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

// The SSE event shape the frontend consumes. Field names match the historical
// Go implementation (yaml wire format).
export interface CorazonEvent {
  seq: number;
  kind: string; // "markdown" | "error"
  markdown?: string;
  done?: boolean;
  error?: { code: string; message: string };
}

type Listener = (ev: CorazonEvent) => void;

interface Sess {
  id: string;
  agent?: AgentSession; // undefined in stub mode (no API key)
  events: CorazonEvent[];
  listeners: Set<Listener>;
  tail: Promise<void>; // serializes prompts within the session
  turnText: string; // accumulated assistant text of the in-flight turn
  turns: number; // turns elapsed in the in-flight prompt (loop cap)
  recordSeq: number;
}

// pi's agent loop has no built-in round cap; stop a runaway turn loop
// gracefully after this many turns (mirrors the historical maxRounds=12).
const MAX_TURNS = 12;

// Default model when --model is not given: DeepSeek Flash.
const DEFAULT_MODEL = "deepseek/deepseek-flash";

export interface RegistryOptions {
  root: string;
  logBase: string;
  systemPrompt: string;
  model?: string; // CLI model pattern, e.g. "deepseek/deepseek-chat" or "sonnet:high"
}

// Registry owns all chat sessions. The agent loop itself is pi's
// (@earendil-works/pi-coding-agent SDK, in-process); this class only adapts
// pi's AgentSession to the historical corazon HTTP/SSE contract.
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
      id: randomBytes(8).toString("hex"),
      events: [],
      listeners: new Set(),
      tail: Promise.resolve(),
      turnText: "",
      turns: 0,
      recordSeq: 0,
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
        // HTTP via curl) + write/edit. External CLIs run through bash.
        tools: ["read", "grep", "find", "ls", "bash", "write", "edit"],
      });
      sess.agent = session;
      session.agent.shouldStopAfterTurn = () => ++sess.turns >= MAX_TURNS;
      session.subscribe((ev) => {
        dbg(sess.id, "pi", ev.type, ev.type === "message_update"
          ? (ev as any).assistantMessageEvent?.type
          : "");
        if (
          ev.type === "message_update" &&
          ev.assistantMessageEvent?.type === "text_delta"
        ) {
          const delta = ev.assistantMessageEvent.delta;
          sess.turnText += delta;
          this.append(sess, { kind: "markdown", markdown: delta });
        }
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

  // ask queues a prompt; the reply streams back as markdown events, terminated
  // by a done event. Prompts within one session are serialized (tail chain).
  ask(sess: Sess, prompt: string): void {
    this.record(sess, "user", prompt);
    if (!sess.agent) {
      const reply = `Corazon AI (dev stub) received your prompt:\n\n> ${prompt}`;
      this.append(sess, { kind: "markdown", markdown: reply });
      this.append(sess, { kind: "markdown", done: true });
      this.record(sess, "assistant", reply);
      return;
    }
    const agent = sess.agent;
    sess.tail = sess.tail.then(() => this.runTurn(sess, agent, prompt));
  }

  private async runTurn(
    sess: Sess,
    agent: AgentSession,
    prompt: string,
  ): Promise<void> {
    sess.turnText = "";
    sess.turns = 0;
    dbg(sess.id, "runTurn start", prompt.slice(0, 60));
    try {
      // prompt() resolves after the full run settles, including retries.
      if (agent.isStreaming) {
        await agent.prompt(prompt, { streamingBehavior: "followUp" });
      } else {
        await agent.prompt(prompt);
      }
    } catch (err) {
      dbg(sess.id, "runTurn error", String(err));
      this.append(sess, {
        kind: "error",
        error: { code: "ai_error", message: String(err) },
      });
    }
    dbg(sess.id, "runTurn done");
    this.append(sess, { kind: "markdown", done: true });
    this.record(sess, "assistant", sess.turnText);
  }

  // subscribe returns the backlog and registers a live listener.
  subscribe(sess: Sess, listener: Listener): CorazonEvent[] {
    sess.listeners.add(listener);
    return [...sess.events];
  }

  unsubscribe(sess: Sess, listener: Listener): void {
    sess.listeners.delete(listener);
  }

  private append(sess: Sess, ev: Omit<CorazonEvent, "seq">): void {
    const full = { ...ev, seq: sess.events.length + 1 };
    sess.events.push(full);
    for (const l of sess.listeners) l(full);
  }

  private record(sess: Sess, msgKind: string, content: string): void {
    record(this.opts.logBase, sess.id, ++sess.recordSeq, msgKind, content);
  }
}
