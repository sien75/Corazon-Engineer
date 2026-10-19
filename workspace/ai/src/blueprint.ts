// Blueprints are the only "class" in the system: a prototype directory
// `.agents/blueprints/<slug>/` with two required files — README.md (what the
// agent is told about the UI it drives) and index.html (the UI's entry) — and
// anything else the page needs: css, js, images, subdirectories. Relative URLs
// work because the whole directory, and only it, is what gets served.
//
// There is no per-agent copy: the web server serves the prototype directory
// itself at /agent/<sessionId>/, resolving the session to its slug through log.
// One page per blueprint, shared by every agent made from it — an edit is
// visible to all of them on reload, and lands in the project's working tree.
//
// Instantiation therefore only checks the two required files and returns the
// README text, which the registry appends to that session's system prompt.

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";

const BLUEPRINT_DIR = path.join(".agents", "blueprints");
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
// web server serves the whole directory, so an asset the page links with a
// relative URL resolves.
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

// blueprintReadme is the prototype's opening context, read fresh for each agent
// made from it. It validates the two required files on the way — a slug that
// misses one is the caller's mistake, never a page the web server would serve.
export function blueprintReadme(root: string, slug: string): string {
  return readBlueprint(root, slug).readme;
}

// legacyAgentDir is the per-agent copy older projects still have on disk. Nothing
// writes it any more; it exists so a session created before blueprints stopped
// being copied keeps working (its page and its README).
export function legacyAgentDir(root: string, sessionId: string): string {
  return path.join(root, ".engineer", "agents", sessionId);
}
