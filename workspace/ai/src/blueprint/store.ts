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

// A blueprint is a **frontend resource** — the class behind a page. It is a
// directory in the project, `.agents/blueprints/<slug>/`, with one html entry
// (`index.html`) and whatever files sit beside it (js, css, images, subdirs).
// The web service serves that directory under `/pages/<slug>/` and the frontend
// renders it in an iframe; there is no page without a blueprint.
//
// Unlike a skill there is no discovery and no sqlite: the directory listing is
// the whole truth. Writing is the agent's job (`save_blueprint`), the API
// exposes the same three operations to the frontend so it can list and delete.
export interface BlueprintFile {
  path: string;
  content: string;
}

export interface Blueprint {
  id: string; // the directory name
  name: string; // the index.html <title>, falling back to the id
  entry: string; // the html entry, always "index.html"
  files: string[]; // relative paths inside the directory, sorted
  createdAt: string;
  updatedAt: string;
}

// A failure the HTTP layer has to translate: bad input is 400, an id that is not
// there is 404. Everything else is a real error and must escape.
export class BlueprintError extends Error {
  constructor(
    public code: "bad_request" | "not_found",
    message: string,
  ) {
    super(message);
  }
}

const BLUEPRINTS_DIR = path.join(".agents", "blueprints");
const ENTRY = "index.html";

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// titleOf reads a display name out of the entry html. There is no manifest file:
// the document's own <title> is the name, and a document without one is named
// after its directory.
function titleOf(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? oneLine(m[1]) : "";
}

// slugify turns a blueprint name into a directory name: lowercase, dashes,
// nothing that could climb out of the blueprints directory.
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "blueprint";
}

// normalizeRel accepts a blueprints-relative file path and returns it clean, or
// undefined when it is not one. The path arrives from HTTP or from a tool call:
// only forward, relative, non-escaping paths may ever be turned into a write.
function normalizeRel(p: string): string | undefined {
  const raw = String(p ?? "").trim();
  if (!raw || raw.startsWith("/") || raw.includes("\\") || /^[a-z]:/i.test(raw)) {
    return undefined;
  }
  const parts = raw.split("/");
  if (parts.some((s) => !s || s === "." || s === "..")) return undefined;
  return parts.join("/");
}

export class BlueprintStore {
  private dir: string;

  constructor(root: string) {
    this.dir = path.join(root, BLUEPRINTS_DIR);
  }

  // A blueprint id is a directory name: only a plain slug may become a path.
  private blueprintDir(id: string): string | undefined {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return undefined;
    return path.join(this.dir, id);
  }

  // filesIn lists a blueprint directory recursively — relative, slash-separated
  // paths, sorted. Dotfiles are skipped: they are never part of a page.
  private filesIn(dir: string, prefix = ""): string[] {
    const out: string[] = [];
    const walk = (d: string, p: string) => {
      let entries;
      try {
        entries = readdirSync(d, { withFileTypes: true });
      } catch {
        return; // unreadable directory: nothing to list
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const rel = p ? `${p}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(d, e.name), rel);
        else out.push(rel);
      }
    };
    walk(dir, prefix);
    return out.sort();
  }

  // mtimesOf reports the newest modification time among the files listed, used
  // as the blueprint's updatedAt: editing any asset counts, not just the entry.
  private updatedAt(dir: string, files: string[]): string {
    let newest = 0;
    for (const f of files) {
      try {
        const s = statSync(path.join(dir, f));
        if (s.mtimeMs > newest) newest = s.mtimeMs;
      } catch {
        // a file that vanished mid-listing simply does not count
      }
    }
    return new Date(newest || Date.now()).toISOString();
  }

  // read loads one blueprint, or undefined when the directory has no entry — a
  // directory without index.html is not a blueprint (it may hold notes, scripts,
  // whatever).
  private read(id: string): Blueprint | undefined {
    const dir = this.blueprintDir(id);
    if (!dir) return undefined;
    const entryFile = path.join(dir, ENTRY);
    let html: string;
    let stat: Stats;
    try {
      html = readFileSync(entryFile, "utf8");
      stat = statSync(entryFile);
    } catch {
      return undefined;
    }
    const files = this.filesIn(dir);
    const created = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
    return {
      id,
      name: titleOf(html) || id,
      entry: ENTRY,
      files,
      createdAt: created.toISOString(),
      updatedAt: this.updatedAt(dir, files.length ? files : [ENTRY]),
    };
  }

  list(): Blueprint[] {
    let ids: string[];
    try {
      ids = readdirSync(this.dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return []; // no blueprints yet
    }
    const out: Blueprint[] = [];
    for (const id of ids) {
      const bp = this.read(id);
      if (bp) out.push(bp);
    }
    return out.sort((a, b) =>
      a.updatedAt === b.updatedAt
        ? a.id.localeCompare(b.id)
        : a.updatedAt < b.updatedAt
          ? 1
          : -1,
    );
  }

  get(id: string): Blueprint | undefined {
    return this.read(id);
  }

  private uniqueSlug(name: string): string {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; existsSync(path.join(this.dir, slug)); n++) {
      slug = `${base}-${n}`;
    }
    return slug;
  }

  // save writes files into a blueprint directory, creating it when there is no
  // id. It **writes, it does not delete**: files the request does not mention
  // stay, so adding a stylesheet to an existing page never wipes its assets.
  save(input: { id?: string; name: string; files: BlueprintFile[] }): Blueprint {
    const files = Array.isArray(input.files) ? input.files : [];
    if (!files.length) {
      throw new BlueprintError("bad_request", "files are required");
    }
    const rel = files.map((f) => normalizeRel(String(f?.path ?? "")));
    for (let i = 0; i < rel.length; i++) {
      if (!rel[i]) {
        throw new BlueprintError(
          "bad_request",
          `unsafe file path: ${String(files[i]?.path ?? "")}`,
        );
      }
    }
    const name = String(input.name ?? "").trim();
    let id: string;
    if (input.id) {
      const dir = this.blueprintDir(input.id);
      if (!dir || !existsSync(path.join(dir, ENTRY))) {
        throw new BlueprintError("not_found", `blueprint not found: ${input.id}`);
      }
      id = input.id;
    } else {
      if (!name) throw new BlueprintError("bad_request", "name is required");
      id = this.uniqueSlug(name);
    }

    // The blueprint must keep its entry, but not every request has to carry it:
    // adding a stylesheet to a page that already has one is a normal save.
    if (!rel.includes(ENTRY) && !existsSync(path.join(this.blueprintDir(id)!, ENTRY))) {
      throw new BlueprintError("bad_request", `files must include ${ENTRY}`);
    }

    const dir = this.blueprintDir(id)!;
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < files.length; i++) {
      const abs = path.join(dir, rel[i]!);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, String(files[i]?.content ?? ""));
    }
    return this.read(id)!;
  }

  remove(id: string): boolean {
    const dir = this.blueprintDir(id);
    if (!dir || !existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  }
}
