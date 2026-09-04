import { readFileSync } from "node:fs";
import path from "node:path";
import { Registry } from "./registry.ts";
import { serve } from "./server.ts";

// usage: bun run src/main.ts [--addr :7501] [--root <project dir>]
//        [--log http://localhost:7503] [--model provider/model-id]

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      out[argv[i].slice(2)] = argv[++i];
    }
  }
  return out;
}

function findRoot(): string {
  let dir = process.cwd();
  for (;;) {
    try {
      readFileSync(path.join(dir, "corazon.yaml"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        console.error("corazon.yaml not found in any parent directory");
        process.exit(1);
      }
      dir = parent;
    }
  }
}

// loadCredentials reads key=value pairs from <root>/.corazon/credentials/pi.md
// (blank lines and # comments ignored) into process env, without overriding
// variables that are already set. pi's ModelRuntime picks up provider keys
// from env (DEEPSEEK_API_KEY, KIMI_API_KEY, ANTHROPIC_API_KEY, ...), so any
// pi-supported provider can be configured in that one file. Other files under
// credentials/ belong to other purposes and are NOT touched.
function loadCredentials(root: string): void {
  let data: string;
  try {
    data = readFileSync(
      path.join(root, ".corazon", "credentials", "pi.md"),
      "utf8",
    );
  } catch {
    return;
  }
  for (const line of data.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      if (!process.env[key]) {
        process.env[key] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}

const flags = parseFlags(process.argv.slice(2));
const root = flags.root || findRoot();
const addr = flags.addr || ":7501";
const logBase = flags.log || "http://localhost:7503";

// Provider keys from .corazon/credentials/pi.md → env, for pi's ModelRuntime.
loadCredentials(root);

const systemPrompt = readFileSync(
  path.join(import.meta.dir, "..", "system-prompt.md"),
  "utf8",
);

const registry = new Registry({
  root,
  logBase,
  systemPrompt,
  model: flags.model, // e.g. "deepseek/deepseek-chat", "anthropic/claude-sonnet-4-6"
});
await registry.init();
if (registry.stub) {
  console.error(
    "warning: no authenticated LLM provider found (env vars, " +
      `${root}/.corazon/credentials/pi.md, or pi's auth.json); ` +
      "ai falls back to echo stub",
  );
} else {
  console.log(`corazon ai: model=${registry.modelInfo}`);
}
console.log(`corazon ai: log=${logBase}`);
serve(registry, addr);
