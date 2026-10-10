import type { PendingRun, Skill, SkillStore } from "./store.ts";

// A scan fires once this many settled runs are waiting. Runs accumulate across
// sessions; a bigger pile only makes a bigger scan, never a bigger prompt (the
// batch is capped at SCAN_BATCH and shrinks further until it fits).
//
// Discovery is deliberately restrained: a capability has to keep coming back
// before it is worth proposing. Thirty settled runs is roughly a working day of
// real use, and the prompt below still asks for three separate sightings before
// anything is proposed.
export const SCAN_THRESHOLD = 30;
// How many of the waiting runs one scan reads at a time. The rest stay queued
// for the next scan, so a long backlog is mined in batches, not all at once.
const SCAN_BATCH = 10;
// Never propose more than this many skills from one scan. Preferring few is the
// point: a suggestion the user has to ignore is worse than no suggestion.
const MAX_SUGGESTIONS = 2;
// Keep a skill name short enough to be a tab label.
const MAX_NAME = 24;

export interface SuggesterDeps {
  store: SkillStore;
  // oneShot performs a single non-streaming model call outside any user
  // session. undefined = no model configured (dev stub).
  oneShot: (prompt: string) => Promise<string | undefined>;
  // inputBudgetTokens is the prompt size we are willing to send, in tokens.
  inputBudgetTokens: () => number;
}

export interface ScanResult {
  triggered: boolean;
  scanned: number;
}

type Outcome =
  | { kind: "ok"; skills: { name: string; text: string }[] }
  | { kind: "overflow" }
  | { kind: "failed" };

function estimateTokens(s: string): number {
  // Same chars/4 heuristic the rest of the stack uses; it over-estimates, which
  // is the safe direction here.
  return Math.ceil(s.length / 4);
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstLine(s: string): string {
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  const head = Math.floor(limit * 0.7);
  const tail = limit - head;
  return `${s.slice(0, head)}\n… [truncated] …\n${s.slice(s.length - tail)}`;
}

function buildPrompt(
  batch: PendingRun[],
  known: Skill[],
  runCharLimit?: number,
): string {
  const existing = known.length
    ? known
        .map((t) => `- ${t.name}: ${firstLine(t.text).slice(0, 200)}`)
        .join("\n")
    : "(none yet)";
  const runs = batch
    .map((r, i) => {
      const text = runCharLimit ? truncate(r.text, runCharLimit) : r.text;
      return `--- run ${i + 1} (${r.createdAt}) ---\n${text}`;
    })
    .join("\n\n");
  return [
    "You mine a developer's past agent runs for skills worth saving as reusable shortcuts.",
    "",
    "A skill is one piece of text: running it opens a fresh conversation and hands that text to an agent as its first message. A good skill is a self-contained instruction for a capability the developer reaches for again and again.",
    "",
    "Already-known skills — never propose anything equivalent to these (they are either already saved or already rejected by the user):",
    existing,
    "",
    "Recent runs, oldest first. Tool calls and tool output are omitted; only what the user asked and what the agent replied is shown:",
    runs,
    "",
    "Return STRICT JSON and nothing else:",
    '{"skills":[{"name":"short plain tab label, <= 24 chars","text":"the reusable instruction"}]}',
    "",
    "Rules:",
    "- Be restrained. Propose at most 2, and prefer 0. An ignored suggestion is worse than none.",
    "- Propose a capability only when the same kind of work appears in at least THREE different runs. One sighting is never enough.",
    "- Propose only general, reusable capabilities. Reject one-off work: a specific bug, a single named file, a ticket number, a date, a customer, a one-time migration.",
    "- Ask: would this instruction be useful unchanged next week, on another project? If not, do not propose it.",
    "- `name` is a short, plain tab label (<= 24 chars) in the language the user writes in. It must say what the skill does at a glance: no jargon, no acronyms, no tool names, no sentences, nothing vague.",
    "- `text` is the standalone instruction; it must make sense with no conversation context.",
    "- No commentary outside the JSON.",
  ].join("\n");
}

function isOverflowError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /context (window|length|overflow)|overflow|too long|maximum.{0,20}tokens|reduce the length/i.test(
    msg,
  );
}

function parseSkills(raw: string): { name: string; text: string }[] {
  const cleaned = raw.replace(/```(?:json)?/gi, "");
  let data: any;
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (objStart >= 0 && objEnd > objStart) {
    try {
      data = JSON.parse(cleaned.slice(objStart, objEnd + 1));
    } catch {
      return [];
    }
  } else if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      data = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    } catch {
      return [];
    }
  } else {
    return [];
  }
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.skills)
      ? data.skills
      : [];
  const out: { name: string; text: string }[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const text = String(item.text ?? "").trim();
    if (!text) continue;
    out.push({ name: String(item.name ?? "").trim(), text });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

// Without a model (dev stub) we cannot summarize, but the plumbing around the
// scan should still be exercisable: derive one deterministic candidate from the
// oldest run of the batch.
function stubSkills(batch: PendingRun[]): { name: string; text: string }[] {
  const text = firstLine(batch[0]?.text ?? "").slice(0, 400);
  if (!text) return [];
  return [{ name: text.slice(0, MAX_NAME), text }];
}

// Suggester turns settled runs into suggested skills. Runs until the model, it
// owns no session and never touches the user's conversation.
export class Suggester {
  constructor(private deps: SuggesterDeps) {}

  // maybeScan runs one scan if enough runs are waiting (or force is set) and no
  // scan is in flight. It never throws: it is called fire-and-forget from the
  // settle path.
  async maybeScan(opts: { force?: boolean } = {}): Promise<ScanResult> {
    const store = this.deps.store;
    // Check-and-set is synchronous, so two callers cannot both enter.
    if (store.getState("in_progress") === "1") {
      return { triggered: false, scanned: 0 };
    }
    const pending = store.openPending();
    if (!pending.length) return { triggered: false, scanned: 0 };
    if (!opts.force && pending.length < SCAN_THRESHOLD) {
      return { triggered: false, scanned: 0 };
    }
    store.setState("in_progress", "1");
    try {
      return { triggered: true, scanned: await this.scan(pending) };
    } catch (err) {
      console.error(`engineer ai: skill scan error: ${String(err)}`);
      return { triggered: true, scanned: 0 };
    } finally {
      store.setState("in_progress", "0");
      store.setState("last_scan_at", new Date().toISOString());
    }
  }

  // scan walks a batch of runs and, on overflow, drops the newest run and
  // retries — the dropped run stays in the queue for the next scan.
  private async scan(pending: PendingRun[]): Promise<number> {
    const store = this.deps.store;
    const known = store.known();
    const budget = this.deps.inputBudgetTokens();
    let n = Math.min(pending.length, SCAN_BATCH);
    while (n >= 1) {
      const batch = pending.slice(0, n);
      let prompt = buildPrompt(batch, known);
      if (estimateTokens(prompt) > budget) {
        if (n > 1) {
          n--;
          continue;
        }
        // A single run does not fit: keep its head and tail and send that.
        const overhead = estimateTokens(buildPrompt([], known));
        const limit = Math.max(400, (budget - overhead) * 4 - 200);
        prompt = buildPrompt(batch, known, limit);
      }
      const outcome = await this.runOnce(prompt, batch);
      if (outcome.kind === "ok") {
        this.persist(outcome.skills, batch, known);
        store.markSummarized(batch.map((r) => r.id));
        return batch.length;
      }
      if (outcome.kind === "failed" || n === 1) return 0;
      n--;
    }
    return 0;
  }

  private async runOnce(
    prompt: string,
    batch: PendingRun[],
  ): Promise<Outcome> {
    let raw: string | undefined;
    try {
      raw = await this.deps.oneShot(prompt);
    } catch (err) {
      if (isOverflowError(err)) return { kind: "overflow" };
      console.error(`engineer ai: skill scan failed: ${String(err)}`);
      return { kind: "failed" };
    }
    // No model: deterministic local candidate so the rest of the flow is real.
    if (raw === undefined) return { kind: "ok", skills: stubSkills(batch) };
    const skills = parseSkills(raw);
    if (!skills.length) {
      // The call itself succeeded — retrying the same input would just cost
      // money again, so these runs are considered handled.
      console.error("engineer ai: skill scan produced no skills");
    }
    return { kind: "ok", skills };
  }

  // persist drops anything equivalent to an already-known skill (kept or
  // already proposed) or to an earlier item of the same scan, then writes the
  // rest out as candidate files.
  private persist(
    items: { name: string; text: string }[],
    batch: PendingRun[],
    known: Skill[],
  ): number {
    const seen = new Set<string>();
    for (const t of known) {
      seen.add(norm(t.name));
      seen.add(norm(t.text));
    }
    let added = 0;
    for (const item of items) {
      const text = item.text.trim();
      const name = item.name.trim() || firstLine(text).slice(0, MAX_NAME);
      if (!text) continue;
      if (seen.has(norm(name)) || seen.has(norm(text))) continue;
      seen.add(norm(name));
      seen.add(norm(text));
      this.deps.store.addSuggested(name, text);
      added++;
    }
    return added;
  }
}
