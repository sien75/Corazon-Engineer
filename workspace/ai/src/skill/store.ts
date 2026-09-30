import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
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

function now(): string {
  return new Date().toISOString();
}

function newID(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
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

// SkillStore owns the skill system's sqlite (`.engineer/skill.db`): the skill table
// (custom + suggested), the settled-run queue feeding suggestion scans, the
// session→skill instantiation map, and scan bookkeeping. It is deliberately
// separate from log's database — log is records, this is the skill model.
export class SkillStore {
  private db: Database;

  constructor(root: string) {
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

  // --- skills ---

  list(filter: SkillFilter = {}): Skill[] {
    const where: string[] = [];
    const args: any[] = [];
    if (filter.source) {
      where.push("source = ?");
      args.push(filter.source);
    }
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    const sql =
      "SELECT * FROM skill" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY updated_at DESC, id ASC";
    return (this.db.query(sql).all(...(args as any[])) as any[]).map(rowToSkill);
  }

  get(id: string): Skill | undefined {
    const row = this.db
      .query("SELECT * FROM skill WHERE id = ?")
      .get(id) as any;
    return row ? rowToSkill(row) : undefined;
  }

  // save creates a skill, or updates/converts an existing one. Saving always
  // yields a custom active skill: saving a suggested candidate is how the user
  // accepts it (it moves out of Suggested into My Skills).
  save(input: { id?: string; name: string; text: string }): Skill | undefined {
    const ts = now();
    if (input.id) {
      if (!this.get(input.id)) return undefined;
      this.db
        .query(
          "UPDATE skill SET name = ?, text = ?, source = 'custom', status = 'active', evidence = NULL, updated_at = ? WHERE id = ?",
        )
        .run(input.name, input.text, ts, input.id);
      return this.get(input.id);
    }
    const id = newID("t");
    this.db
      .query(
        "INSERT INTO skill (id, name, text, source, status, evidence, created_at, updated_at) VALUES (?, ?, ?, 'custom', 'active', NULL, ?, ?)",
      )
      .run(id, input.name, input.text, ts, ts);
    return this.get(id);
  }

  remove(id: string): boolean {
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
    return this.get(id)!;
  }

  // setIgnored marks a suggested candidate as rejected, or restores it. Ignored
  // skills stay in the table: their text keeps them out of future suggestions.
  setIgnored(id: string, ignored: boolean): Skill | undefined {
    if (!this.get(id)) return undefined;
    this.db
      .query("UPDATE skill SET status = ?, updated_at = ? WHERE id = ?")
      .run(ignored ? "ignored" : "active", now(), id);
    return this.get(id);
  }

  // known returns every skill (including ignored ones) as name + text, for the
  // scan prompt: the model is told not to propose what is already there.
  known(): Skill[] {
    return (this.db
      .query("SELECT * FROM skill ORDER BY source DESC, updated_at DESC")
      .all() as any[]).map(rowToSkill);
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
