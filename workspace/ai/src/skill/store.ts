import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";

export type SkillSource = "custom" | "suggested";
export type SkillStatus = "active";

// A skill is one piece of text. Running it opens a session and hands the text to
// the model as the first prompt; nothing else describes it (no tools, no
// parameters, no visualization).
//
// Everything is a **file**: a kept skill is `.agents/skills/<slug>/SKILL.md`, a
// discovered candidate is `.engineer/suggested-skills/<slug>.md`. There is no
// database — the directory listing is the whole truth, and static serves it to
// the frontend as two read-only types (skill / suggested-skill).
export interface Skill {
  id: string;
  name: string;
  text: string;
  source: SkillSource;
  createdAt: string;
  updatedAt: string;
}

// One settled run of a session, waiting to be mined for suggestions. The run's
// conversation text is captured when it settles, so the scan never has to read
// back from log (and never races log writes).
export interface PendingRun {
  id: string;
  sessionId: string;
  text: string;
  createdAt: string;
}

const SKILLS_DIR = path.join(".agents", "skills");
const SUGGESTED_DIR = path.join(".engineer", "suggested-skills");
const SKILL_FILE = "SKILL.md";
const SCAN_FILE = path.join(".engineer", "skill-scan.json");
const DESCRIPTION_MAX = 120;

// The scan bookkeeping file: the settled runs not yet mined and the two pieces
// of scan state. Small, rewritten whole on every change.
interface ScanState {
  inProgress: boolean;
  lastScanAt: string;
  pending: PendingRun[];
}

function now(): string {
  return new Date().toISOString();
}

function newID(prefix: string): string {
  let s = "";
  for (let i = 0; i < 16; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return `${prefix}_${s}`;
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function firstLine(s: string): string {
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

// slugify turns a name into a file/directory name: lowercase, dashes, nothing
// that could climb out of the store.
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "skill";
}

// renderSkillFile writes a skill out. name / description are folded onto one
// line: the file is read back by a plain line-based parser, here and elsewhere.
function renderSkillFile(name: string, text: string): string {
  const body = text.trim();
  const description = oneLine(firstLine(body)).slice(0, DESCRIPTION_MAX);
  return `---\nname: ${oneLine(name)}\ndescription: ${description}\n---\n${body}\n`;
}

// parseSkillFile reads one skill file back. A missing frontmatter is tolerated:
// the whole file is the text and the file name stands in for the name.
function parseSkillFile(
  slug: string,
  raw: string,
  source: SkillSource,
  createdAt: string,
  updatedAt: string,
): Skill {
  let name = "";
  let body = raw;
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (front) {
    body = raw.slice(front[0].length);
    for (const line of front[1].split("\n")) {
      const m = /^(name|description)\s*:(.*)$/.exec(line.trim());
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (m[1] === "name") name = value;
    }
  }
  return {
    id: slug,
    name: name || slug,
    text: body.trim(),
    source,
    createdAt,
    updatedAt,
  };
}

// SkillStore owns the two file stores and the scan bookkeeping — all files, no
// database. static reads the first two directly; this class only writes them.
export class SkillStore {
  private skillsDir: string;
  private suggestedDir: string;
  private scanFile: string;

  constructor(root: string) {
    this.skillsDir = path.join(root, SKILLS_DIR);
    this.suggestedDir = path.join(root, SUGGESTED_DIR);
    this.scanFile = path.join(root, SCAN_FILE);
  }

  // A skill id is a file/directory name and it arrives from HTTP: only a plain
  // slug may ever be turned into a path.
  private safeSlug(id: string): boolean {
    return /^[a-z0-9][a-z0-9-]*$/.test(id);
  }

  private skillDir(id: string): string | undefined {
    return this.safeSlug(id) ? path.join(this.skillsDir, id) : undefined;
  }

  private readOne(dir: string, id: string, source: SkillSource, file: string): Skill | undefined {
    if (!this.safeSlug(id)) return undefined;
    const full = path.join(dir, id, file);
    let raw: string;
    let stat: Stats;
    try {
      raw = readFileSync(full, "utf8");
      stat = statSync(full);
    } catch {
      return undefined;
    }
    // birthtime is the creation time on filesystems that have one (macOS, ext4);
    // where it is missing, the file's identity as "created here" is the mtime.
    const created = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
    return parseSkillFile(id, raw, source, created.toISOString(), stat.mtime.toISOString());
  }

  // customSkills reads the whole skills directory. A directory without a
  // SKILL.md is not a skill (it may hold notes, scripts, whatever) and is skipped.
  private customSkills(): Skill[] {
    let slugs: string[];
    try {
      slugs = readdirSync(this.skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return []; // no skills yet
    }
    const out: Skill[] = [];
    for (const slug of slugs) {
      const skill = this.readOne(this.skillsDir, slug, "custom", SKILL_FILE);
      if (skill) out.push(skill);
    }
    return out;
  }

  // suggestedSkills reads one markdown file per candidate.
  private suggestedSkills(): Skill[] {
    let files: string[];
    try {
      files = readdirSync(this.suggestedDir).filter((f) => f.endsWith(".md")).sort();
    } catch {
      return []; // no candidates yet
    }
    const out: Skill[] = [];
    for (const f of files) {
      const id = f.slice(0, -3);
      if (!this.safeSlug(id)) continue;
      let raw: string;
      let stat: Stats;
      try {
        raw = readFileSync(path.join(this.suggestedDir, f), "utf8");
        stat = statSync(path.join(this.suggestedDir, f));
      } catch {
        continue;
      }
      const created = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
      out.push(parseSkillFile(id, raw, "suggested", created.toISOString(), stat.mtime.toISOString()));
    }
    return out;
  }

  get(id: string): Skill | undefined {
    if (!this.safeSlug(id)) return undefined;
    return (
      this.readOne(this.skillsDir, id, "custom", SKILL_FILE) ??
      this.readOne(this.suggestedDir, id, "suggested", `${id}.md`)
    );
  }

  // known returns every skill (kept or proposed) as name + text, for the scan
  // prompt: the model is told not to propose what is already there.
  known(): Skill[] {
    return this.customSkills().concat(this.suggestedSkills());
  }

  // uniqueSlug finds a free name across both stores.
  private uniqueSlug(name: string): string {
    const base = slugify(name);
    const taken = (s: string) =>
      existsSync(path.join(this.skillsDir, s)) ||
      existsSync(path.join(this.suggestedDir, `${s}.md`));
    let slug = base;
    for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
    return slug;
  }

  // addSuggested writes one discovered candidate as a file.
  addSuggested(name: string, text: string): Skill {
    const id = this.uniqueSlug(name);
    mkdirSync(this.suggestedDir, { recursive: true });
    writeFileSync(path.join(this.suggestedDir, `${id}.md`), renderSkillFile(name, text));
    return this.readOne(this.suggestedDir, id, "suggested", `${id}.md`)!;
  }

  // --- scan bookkeeping (a single json file) ---

  private readScan(): ScanState {
    try {
      const doc = JSON.parse(readFileSync(this.scanFile, "utf8"));
      return {
        inProgress: doc.inProgress === true,
        lastScanAt: typeof doc.lastScanAt === "string" ? doc.lastScanAt : "",
        pending: Array.isArray(doc.pending) ? doc.pending : [],
      };
    } catch {
      return { inProgress: false, lastScanAt: "", pending: [] };
    }
  }

  private writeScan(state: ScanState): void {
    mkdirSync(path.dirname(this.scanFile), { recursive: true });
    const tmp = `${this.scanFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, this.scanFile);
  }

  enqueueRun(sessionId: string, text: string): void {
    if (!text.trim()) return;
    const state = this.readScan();
    state.pending.push({ id: newID("r"), sessionId, text, createdAt: now() });
    this.writeScan(state);
  }

  openPending(limit?: number): PendingRun[] {
    const pending = [...this.readScan().pending].sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1,
    );
    return limit && limit > 0 ? pending.slice(0, limit) : pending;
  }

  pendingCount(): number {
    return this.readScan().pending.length;
  }

  // markSummarized drops the runs a scan actually consumed; runs it skipped
  // (or failed to include) stay so they are picked up next round.
  markSummarized(ids: string[]): void {
    const drop = new Set(ids);
    const state = this.readScan();
    state.pending = state.pending.filter((r) => !drop.has(r.id));
    this.writeScan(state);
  }

  getState(key: string): string | undefined {
    const state = this.readScan();
    if (key === "in_progress") return state.inProgress ? "1" : "0";
    if (key === "last_scan_at") return state.lastScanAt || undefined;
    return undefined;
  }

  setState(key: string, value: string): void {
    const state = this.readScan();
    if (key === "in_progress") state.inProgress = value === "1";
    else if (key === "last_scan_at") state.lastScanAt = value;
    this.writeScan(state);
  }
}
