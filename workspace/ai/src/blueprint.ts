// Blueprints are the only "class" in the system: a prototype directory
// `.agents/blueprints/<slug>/` holding exactly two files — README.md (what the
// agent is told about the UI it drives) and index.html (the UI itself, which
// must be self-contained: no sibling js / css / images).
//
// Instantiating one copies both files into `.engineer/agents/<sessionId>/` and
// returns the README text, which the registry appends to that session's system
// prompt. From that moment the agent owns its copy: editing or deleting the
// prototype does not touch it, and what the web server serves is the copy.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

const BLUEPRINT_DIR = path.join(".agents", "blueprints");
const AGENT_DIR = path.join(".engineer", "agents");
const README = "README.md";
const HTML = "index.html";

// BlueprintError is a bad request: the slug is wrong or the prototype breaks the
// two-file rule. The service turns it into a 400, never a 500.
export class BlueprintError extends Error {}

// slugFrom validates the request's blueprint field. A slug is a directory name,
// so anything that could escape the prototype root is rejected rather than
// normalized.
export function slugFrom(raw: unknown): string {
  const slug = String(raw ?? "").trim();
  if (!slug) throw new BlueprintError("blueprint: empty");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) {
    throw new BlueprintError(`blueprint: bad slug ${JSON.stringify(slug)}`);
  }
  return slug;
}

// readBlueprint reads a prototype and enforces the two-file rule: README.md and
// index.html, nothing else. A stray file is refused here because the copy is
// served as a whole directory — an unnoticed sibling would ship too.
function readBlueprint(
  root: string,
  slug: string,
): { readme: string; html: string } {
  const dir = path.join(root, BLUEPRINT_DIR, slug);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new BlueprintError(`blueprint not found: ${slug}`);
  }
  const extra = entries.filter((name) => name !== README && name !== HTML);
  if (extra.length) {
    throw new BlueprintError(
      `blueprint ${slug}: only ${README} and ${HTML} are allowed, found ${extra.join(", ")}`,
    );
  }
  let readme = "";
  try {
    readme = readFileSync(path.join(dir, README), "utf8");
  } catch {
    throw new BlueprintError(`blueprint ${slug}: ${README} missing`);
  }
  let html = "";
  try {
    html = readFileSync(path.join(dir, HTML), "utf8");
  } catch {
    throw new BlueprintError(`blueprint ${slug}: ${HTML} missing`);
  }
  return { readme, html };
}

// agentDir is where an agent's own copy lives: keyed by session, so the URL the
// UI is served at carries no slug and two agents of one blueprint never collide.
export function agentDir(root: string, sessionId: string): string {
  return path.join(root, AGENT_DIR, sessionId);
}

// instantiateBlueprint copies the prototype into the agent's directory and
// returns the README text. It writes nothing else — the directory is exactly the
// two files, which is what makes "change the prototype, not the agent" true.
export function instantiateBlueprint(
  root: string,
  slug: string,
  sessionId: string,
): string {
  const { readme, html } = readBlueprint(root, slug);
  const dir = agentDir(root, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, README), readme);
  writeFileSync(path.join(dir, HTML), html);
  return readme;
}

// removeAgent deletes an agent's copy. Deleting an agent is a hard delete
// (session, records, copy), so there is nothing to keep here.
export function removeAgent(root: string, sessionId: string): void {
  rmSync(agentDir(root, sessionId), { recursive: true, force: true });
}
