// The engineer's own model config: which model a conversation of each role runs
// by default. It lives in the data home (models.yaml), not in pi's settings — pi
// keeps the catalog, models.json and the credentials, but its own settings no
// longer choose a model.
//
// The file is meant to be edited by hand: ai writes it once with these defaults
// when it is missing, then reads it fresh for every session it builds, so an edit
// applies to the next session (or the next resume), not to one already running.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export type Role = "main" | "sub";

export interface RoleModels {
  // The conversation model: a provider/model-id from pi's chat catalog. This is
  // the one a `model` tool switch and a creation-time `model` override.
  chat: string;
  // The image-generation model: a provider/model-id from pi's image catalog
  // (built in: openrouter only). "" means not configured yet. Read and shape-
  // checked here, but nothing consumes it until an image tool exists.
  image: string;
}

export interface ModelsConfig {
  main: RoleModels;
  sub: RoleModels;
}

export const DEFAULT_CHAT = "deepseek/deepseek-flash";
export const DEFAULT_IMAGE = "";

function defaults(): RoleModels {
  return { chat: DEFAULT_CHAT, image: DEFAULT_IMAGE };
}

const DEFAULT_FILE = `# Engineer's own model config: one default per role, provider/model-id.
# chat:  the conversation model (pi's chat catalog).
# image: the image-generation model (pi's image catalog — built in: openrouter
#        only, e.g. openrouter/black-forest-labs/flux.2-flex). "" = not set.
# Edited by hand; ai reads it for every session it builds. pi still owns the
# catalog and the credentials — its own settings never choose a model.

main:
  chat: ${DEFAULT_CHAT}
  image: ""

sub:
  chat: ${DEFAULT_CHAT}
  image: ""
`;

export function modelsConfigPath(home: string): string {
  return path.join(home, "models.yaml");
}

// ensureModelsConfig writes the default file when there is none. A failure to
// write is a warning, not a crash: the service can always run on the built-in
// defaults even if the data home is not writable.
export function ensureModelsConfig(home: string): void {
  const file = modelsConfigPath(home);
  if (existsSync(file)) return;
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(file, DEFAULT_FILE);
  } catch (err) {
    console.error(`warning: could not write ${file}: ${String(err)}`);
  }
}

// isModelRef is the shape check both slots get: provider/model-id, split at the
// first slash. The id may itself contain slashes (image model ids such as
// black-forest-labs/flux.2-flex), so only the first one separates the two.
export function isModelRef(ref: string): boolean {
  const i = ref.indexOf("/");
  return i > 0 && i < ref.length - 1;
}

// roleModels reads one role's two slots. Every slot it has to replace (missing,
// empty where it must not be, or not a provider/model-id) costs a warning and
// falls back to the built-in default; the service keeps going either way.
function roleModels(name: string, raw: any): RoleModels {
  const out = defaults();
  if (raw === undefined || raw === null) {
    console.error(`warning: models.yaml has no ${name}; using defaults`);
    return out;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    console.error(`warning: models.yaml ${name} is not a mapping; using defaults`);
    return out;
  }
  for (const slot of ["chat", "image"] as const) {
    const value = String((raw as any)[slot] ?? "").trim();
    // "" is a valid image slot (no image model chosen yet); chat always needs one.
    if (!value) {
      if (slot === "chat") {
        console.error(`warning: models.yaml ${name}.${slot} is empty; using ${out[slot]}`);
      }
      continue;
    }
    if (!isModelRef(value)) {
      console.error(
        `warning: models.yaml ${name}.${slot} is not provider/model-id: ${value}; using ` +
          `${out[slot] || "(empty)"}`,
      );
      continue;
    }
    out[slot] = value;
  }
  return out;
}

// readModelsConfig reads the file fresh. A missing or unreadable file, or one
// that is not a mapping, falls back to the built-in defaults with a warning.
export function readModelsConfig(home: string): ModelsConfig {
  const file = modelsConfigPath(home);
  let raw: any;
  try {
    raw = YAML.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`warning: could not read ${file}: ${String(err)}; using defaults`);
    return { main: defaults(), sub: defaults() };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    console.error(`warning: ${file} is not a mapping; using defaults`);
    return { main: defaults(), sub: defaults() };
  }
  return { main: roleModels("main", raw.main), sub: roleModels("sub", raw.sub) };
}
