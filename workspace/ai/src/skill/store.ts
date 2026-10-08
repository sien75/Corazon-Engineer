import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";

export type SkillSource = "custom" | "suggested";
export type SkillStatus = "active" | "ignored";

// A skill is one piece of text. Running it opens a session and hands the text to
// the model as the first prompt; nothing else describes it (no tools, no
// parameters, no visualization).
export interface Skill {
  id: string;
  name: string;
  text: string;
  source: SkillSource;
  status: SkillStatus;
  evidence: unknown; // suggested only: where the candidate came from
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

export interface SkillFilter {
  source?: SkillSource;
  status?: SkillStatus;
}

// A custom skill is a **file in the project** — `.agents/skills/<slug>/SKILL.md` —
// so it travels with the project, can be reviewed and versioned, and is readable
// by any other agent that scans `.agents/skills` (pi does). The frontmatter
// carries the display name and a one-line description derived from the text; the
// body is the skill text itself.
const SKILLS_DIR = path.join(".agents", "skills");
const SKILL_FILE = "SKILL.md";
const DESCRIPTION_MAX = 120;

function now(): string {
  return new Date().toISOString();
}

function newID(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
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

// slugify turns a skill name into a directory name: lowercase, dashes, nothing
// that could climb out of the skills directory.
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "skill";
}

// renderSkillFile writes the skill out. name / description are folded onto one
// line: the file is read back by a plain line-based parser, here and elsewhere.
function renderSkillFile(name: string, text: string): string {
  const body = text.trim();
  const description = oneLine(firstLine(body)).slice(0, DESCRIPTION_MAX);
  return `---\nname: ${oneLine(name)}\ndescription: ${description}\n---\n${body}\n`;
}

function rowToSkill(row: any): Skill {
  return {
    id: String(row.id),
    name: String(row.name),
    text: String(row.text),
    source: String(row.source) as SkillSource,
    status: String(row.status) as SkillStatus,
    evidence: row.evidence ? JSON.parse(String(row.evidence)) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// parseSkillFile reads one skill file back. A missing frontmatter is tolerated:
// the whole file is the text and the directory name stands in for the name.
function parseSkillFile(
  slug: string,
  raw: string,
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
    source: "custom",
    status: "active",
    evidence: undefined,
    createdAt,
    updatedAt,
  };
}

// SkillStore owns two things, and the split is the point: the project's custom
// skills, which are files under `.agents/skills/`, and the suggestion machinery
// in its own sqlite (`.engineer/skill.db`) — the suggested candidates, the
// settled-run queue feeding the scans, the session→skill instantiation map and
// the scan bookkeeping. Nothing in the sqlite is a skill the user kept: a `skill`
// row left behind by an older build is simply not read (there is no migration —
// custom skills did not exist before this split).
export class SkillStore {
  private skillsDir: string;
  private db: Database;

  constructor(root: string) {
    this.skillsDir = path.join(root, SKILLS_DIR);
    const dir = path.join(root, ".engineer");
    mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, "skill.db"), { create: true });
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_skill_source ON skill(source, status);

      CREATE TABLE IF NOT EXISTS skill_session (
        session_id TEXT PRIMARY KEY,
        skill_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scan_pending (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        summarized_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pending_open ON scan_pending(summarized_at, created_at);

      CREATE TABLE IF NOT EXISTS scan_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // --- custom skills: the project's files ---

  // A skill id is a directory name, and it arrives from HTTP: only a plain slug
  // may ever be turned into a path.
  private skillDir(id: string): string | undefined {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return undefined;
    return path.join(this.skillsDir, id);
  }

  // readCustom reads one skill file, or undefined when there is none.
  private readCustom(id: string): Skill | undefined {
    const dir = this.skillDir(id);
    if (!dir) return undefined;
    const file = path.join(dir, SKILL_FILE);
    let raw: string;
    let stat: Stats;
    try {
      raw = readFileSync(file, "utf8");
      stat = statSync(file);
    } catch {
      return undefined;
    }
    // birthtime is the creation time on filesystems that have one (macOS, ext4);
    // where it is missing, the file's identity as "created here" is the mtime.
    const created = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
    return parseSkillFile(id, raw, created.toISOString(), stat.mtime.toISOString());
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
      const skill = this.readCustom(slug);
      if (skill) out.push(skill);
    }
    return out;
  }

  private writeSkill(id: string, name: string, text: string): void {
    const dir = this.skillDir(id);
    if (!dir) throw new Error(`unsafe skill id: ${id}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, SKILL_FILE), renderSkillFile(name, text));
  }

  private uniqueSlug(name: string): string {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; existsSync(path.join(this.skillsDir, slug)); n++) {
      slug = `${base}-${n}`;
    }
    return slug;
  }

  // --- suggested candidates: the sqlite ---

  private suggestedRow(id: string): Skill | undefined {
    const row = this.db
      .query("SELECT * FROM skill WHERE id = ? AND source = 'suggested'")
      .get(id) as any;
    return row ? rowToSkill(row) : undefined;
  }

  private suggestedSkills(): Skill[] {
    return (
      this.db.query("SELECT * FROM skill WHERE source = 'suggested'").all() as any[]
    ).map(rowToSkill);
  }

  // --- skills ---

  // list returns custom (file) and suggested (row) skills together, newest
  // updated first.
  list(filter: SkillFilter = {}): Skill[] {
    let skills: Skill[] = [];
    if (filter.source !== "suggested") skills = skills.concat(this.customSkills());
    if (filter.source !== "custom") skills = skills.concat(this.suggestedSkills());
    if (filter.status) skills = skills.filter((s) => s.status === filter.status);
    return skills.sort((a, b) =>
      a.updatedAt === b.updatedAt
        ? a.id.localeCompare(b.id)
        : a.updatedAt < b.updatedAt
          ? 1
          : -1,
    );
  }

  get(id: string): Skill | undefined {
    return this.readCustom(id) ?? this.suggestedRow(id);
  }

  // save creates a skill, or updates/converts an existing one. Saving always
  // yields a custom active skill: saving a suggested candidate is how the user
  // accepts it — the candidate is written out as a file and dropped from the
  // sqlite (it moves out of Suggested into My Skills).
  //
  // A custom skill's id is its directory, and it never moves: renaming rewrites
  // the file, it does not rename the directory, so sessions already linked to
  // that id keep pointing at the right skill.
  save(input: { id?: string; name: string; text: string }): Skill | undefined {
    if (input.id) {
      const existing = this.get(input.id);
      if (!existing) return undefined;
      const id = existing.source === "custom" ? existing.id : this.uniqueSlug(input.name);
      this.writeSkill(id, input.name, input.text);
      if (existing.source === "suggested") {
        this.db.query("DELETE FROM skill WHERE id = ?").run(existing.id);
      }
      return this.readCustom(id);
    }
    const id = this.uniqueSlug(input.name);
    this.writeSkill(id, input.name, input.text);
    return this.readCustom(id);
  }

  remove(id: string): boolean {
    const dir = this.skillDir(id);
    if (dir && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      return true;
    }
    return this.db.query("DELETE FROM skill WHERE id = ?").run(id).changes > 0;
  }

  addSuggested(name: string, text: string, evidence: unknown): Skill {
    const id = newID("t");
    const ts = now();
    this.db
      .query(
        "INSERT INTO skill (id, name, text, source, status, evidence, created_at, updated_at) VALUES (?, ?, ?, 'suggested', 'active', ?, ?, ?)",
      )
      .run(id, name, text, JSON.stringify(evidence ?? {}), ts, ts);
    return this.suggestedRow(id)!;
  }

  // setIgnored marks a suggested candidate as rejected, or restores it. Ignored
  // skills stay in the table: their text keeps them out of future suggestions.
  // A custom skill is a file and has no such state — its id does not resolve here.
  setIgnored(id: string, ignored: boolean): Skill | undefined {
    if (!this.suggestedRow(id)) return undefined;
    this.db
      .query("UPDATE skill SET status = ?, updated_at = ? WHERE id = ?")
      .run(ignored ? "ignored" : "active", now(), id);
    return this.suggestedRow(id);
  }

  // known returns every skill (including ignored ones) as name + text, for the
  // scan prompt: the model is told not to propose what is already there.
  known(): Skill[] {
    return this.customSkills().concat(this.suggestedSkills());
  }

  // --- instantiation ---

  linkSession(sessionId: string, skillId: string | undefined): void {
    this.db
      .query(
        "INSERT INTO skill_session (session_id, skill_id, created_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET skill_id = excluded.skill_id",
      )
      .run(sessionId, skillId ?? null, now());
  }

  // --- suggestion queue ---

  enqueueRun(sessionId: string, text: string): void {
    if (!text.trim()) return;
    this.db
      .query(
        "INSERT INTO scan_pending (id, session_id, text, created_at, summarized_at) VALUES (?, ?, ?, ?, NULL)",
      )
      .run(newID("r"), sessionId, text, now());
  }

  openPending(limit?: number): PendingRun[] {
    const sql =
      "SELECT * FROM scan_pending WHERE summarized_at IS NULL ORDER BY created_at ASC, id ASC" +
      (limit && limit > 0 ? " LIMIT ?" : "");
    const rows = (limit && limit > 0
      ? this.db.query(sql).all(limit)
      : this.db.query(sql).all()) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      text: String(r.text),
      createdAt: String(r.created_at),
    }));
  }

  pendingCount(): number {
    const row = this.db
      .query("SELECT COUNT(*) AS n FROM scan_pending WHERE summarized_at IS NULL")
      .get() as any;
    return Number(row?.n ?? 0);
  }

  // markSummarized flags the runs a scan actually consumed; runs it skipped
  // (or failed to include) stay open so they are picked up next round.
  markSummarized(ids: string[]): void {
    const ts = now();
    const stmt = this.db.query(
      "UPDATE scan_pending SET summarized_at = ? WHERE id = ?",
    );
    for (const id of ids) stmt.run(ts, id);
  }

  // --- scan bookkeeping ---

  getState(key: string): string | undefined {
    const row = this.db
      .query("SELECT value FROM scan_state WHERE key = ?")
      .get(key) as any;
    return row ? String(row.value) : undefined;
  }

  setState(key: string, value: string): void {
    this.db
      .query(
        "INSERT INTO scan_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }
}
