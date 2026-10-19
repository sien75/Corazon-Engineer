// Blueprints are the only "class" in the system: a prototype directory
// `.agents/blueprints/<slug>/` with two required files — README.md (what the
// agent is told about the UI it drives) and index.html (the UI's entry) — and
// anything else the page needs: css, js, images, subdirectories. Relative URLs
// work because the whole directory, and only it, is what gets served.
//
// Instantiating one copies the whole directory into
// `.engineer/agents/<sessionId>/` and returns the README text, which the registry
// appends to that session's system prompt. From that moment the agent owns its
// copy: editing or deleting the prototype does not touch it, and what the web
// server serves is the copy.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

const BLUEPRINT_DIR = path.join(".agents", "blueprints");
const AGENT_DIR = path.join(".engineer", "agents");
const README = "README.md";
const HTML = "index.html";

// BlueprintError is a bad request: the slug is wrong or the prototype is missing
// one of its two required files. The service turns it into a 400, never a 500.
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

// readBlueprint reads a prototype's README and checks that both required files
// are there. Everything else in the directory is the page's own business: the
// copy is made directory-wide, so an asset the page links with a relative URL
// travels with it.
function readBlueprint(root: string, slug: string): { readme: string; dir: string } {
  const dir = path.join(root, BLUEPRINT_DIR, slug);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new BlueprintError(`blueprint not found: ${slug}`);
  }
  if (!entries.includes(README)) {
    throw new BlueprintError(`blueprint ${slug}: ${README} missing`);
  }
  if (!entries.includes(HTML)) {
    throw new BlueprintError(`blueprint ${slug}: ${HTML} missing`);
  }
  return { readme: readFileSync(path.join(dir, README), "utf8"), dir };
}

// agentDir is where an agent's own copy lives: keyed by session, so the URL the
// UI is served at carries no slug and two agents of one blueprint never collide.
export function agentDir(root: string, sessionId: string): string {
  return path.join(root, AGENT_DIR, sessionId);
}

// copyTree copies a prototype directory as-is: directories, then regular files.
// Symbolic links are skipped on purpose — the copy is served as a directory, and
// a link pointing outside it would serve files the blueprint never contained.
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isFile()) copyFileSync(src, dst);
  }
}

// instantiateBlueprint copies the prototype into the agent's directory and
// returns the README text. The copy is a snapshot: what the agent later edits is
// its own, and changing the prototype never reaches it.
export function instantiateBlueprint(
  root: string,
  slug: string,
  sessionId: string,
): string {
  const { readme, dir } = readBlueprint(root, slug);
  copyTree(dir, agentDir(root, sessionId));
  return readme;
}

// removeAgent deletes an agent's copy. Deleting an agent is a hard delete
// (session, records, copy), so there is nothing to keep here.
export function removeAgent(root: string, sessionId: string): void {
  rmSync(agentDir(root, sessionId), { recursive: true, force: true });
}
