import { randomBytes } from "node:crypto";
import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
import { createHttpTool, createCliTool } from "./tools.ts";
import { dbg } from "./debug.ts";

type Model = Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number];

function loadJSON(file: string): string[] {
  try {
    const v = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// The SSE event shape the frontend consumes. Field names match the historical
// Go implementation (yaml wire format).
export interface CorazonEvent {
  seq: number;
  kind: string; // "markdown" | "approval" | "error"
  markdown?: string;
  approval?: Record<string, unknown>;
  done?: boolean;
  error?: { code: string; message: string };
}

type Listener = (ev: CorazonEvent) => void;

interface Sess {
  id: string;
  agent?: AgentSession; // undefined in stub mode (no API key)
  events: CorazonEvent[];
  listeners: Set<Listener>;
  pending: Map<string, (granted: boolean) => void>; // approvalId → resolve
  cliInflight: Map<string, Promise<boolean>>; // program → in-flight approval
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

// cli approvals wait this long for the user, then count as denied.
const APPROVAL_TIMEOUT_MS = 5 * 60_000;

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
  // Programs the user has approved for the cli tool ("first time pops, then
  // runs freely"). Persisted per project; survives restarts.
  private approved: Set<string>;
  private approvedFile: string;

  constructor(private opts: RegistryOptions) {
    this.approvedFile = path.join(
      opts.root,
      ".corazon",
      "ai-approved-cli.json",
    );
    this.approved = new Set(loadJSON(this.approvedFile));
  }

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
      pending: new Map(),
      cliInflight: new Map(),
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
        // Capability surface: network (http) + arbitrary CLI programs (cli).
        // All pi built-in file/shell tools are disabled.
        noTools: "builtin",
        customTools: [createHttpTool(), createCliTool()],
      });
      sess.agent = session;
      session.agent.shouldStopAfterTurn = () => ++sess.turns >= MAX_TURNS;
      // Approval gate: http is never gated; cli is gated per program — the
      // first use pops an approval card, approval is remembered.
      session.agent.beforeToolCall = async ({ toolCall, args }) => {
        if (toolCall.name !== "cli") return undefined;
        const a = args as { program?: string; args?: string[] };
        const program = String(a?.program ?? "");
        if (this.approved.has(program)) return undefined;
        const cmd = `${program} ${(a?.args ?? []).join(" ")}`.trim();
        const granted = await this.requestApproval(sess, program, cmd);
        if (!granted) {
          return { block: true, reason: "operation denied by user" };
        }
        return undefined;
      };
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

  // approve grants a pending approval; the waiting cli tool call resumes.
  approve(sess: Sess, approvalId: string): boolean {
    const resolve = sess.pending.get(approvalId);
    if (!resolve) return false;
    sess.pending.delete(approvalId);
    resolve(true);
    return true;
  }

  // requestApproval emits an approval event and waits for the user's decision.
  // Parallel cli calls for the same program share one card; granting also
  // remembers the program so later calls run without a card.
  private requestApproval(
    sess: Sess,
    program: string,
    cmd: string,
  ): Promise<boolean> {
    const inflight = sess.cliInflight.get(program);
    if (inflight) return inflight;
    const approvalId = randomBytes(8).toString("hex");
    const p = new Promise<boolean>((resolve) => {
      sess.pending.set(approvalId, resolve);
      setTimeout(() => {
        if (sess.pending.delete(approvalId)) {
          dbg(sess.id, "approval timeout", program);
          resolve(false);
        }
      }, APPROVAL_TIMEOUT_MS);
    }).then((granted) => {
      sess.cliInflight.delete(program);
      if (granted) this.rememberApproved(program);
      return granted;
    });
    sess.cliInflight.set(program, p);
    dbg(sess.id, "approval requested", program);
    this.append(sess, {
      kind: "approval",
      approval: { approvalId, title: `cli: ${cmd}` },
    });
    return p;
  }

  private rememberApproved(program: string): void {
    if (this.approved.has(program)) return;
    this.approved.add(program);
    try {
      mkdirSync(path.dirname(this.approvedFile), { recursive: true });
      writeFileSync(this.approvedFile, JSON.stringify([...this.approved]));
    } catch {
      // persistence is best-effort; memory still applies for this process
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

  private append(sess: Sess, ev: Omit<CorazonEvent, "seq">): void {
    const full = { ...ev, seq: sess.events.length + 1 };
    sess.events.push(full);
    for (const l of sess.listeners) l(full);
  }

  private record(sess: Sess, msgKind: string, content: string): void {
    record(this.opts.logBase, sess.id, ++sess.recordSeq, msgKind, content);
  }
}
