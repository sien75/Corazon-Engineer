import { readFileSync } from "node:fs";
import path from "node:path";
import { Registry } from "./registry.ts";
import { serve } from "./server.ts";

// usage: bun run src/main.ts [--addr :7501] [--root <project dir>]
//        [--log http://localhost:7503] [--static http://localhost:7502]
//        [--model provider/model-id]

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

const flags = parseFlags(process.argv.slice(2));
const root = flags.root || findRoot();
const addr = flags.addr || ":7501";
const logBase = flags.log || "http://localhost:7503";
const staticBase = flags.static || "http://localhost:7502";

// TODO: the system prompt belongs to the Corazon tool itself (the agents/
// shipped with the tool), not to the project being processed; where the tool
// resolves it from is still to be decided. For now, read it from the project
// root.
function loadSystemPrompt(root: string): string {
  const primary = path.join(root, "agents", "AGENTS.md");
  try {
    return readFileSync(primary, "utf8");
  } catch {
    console.error(`agents/AGENTS.md not found under project root ${root}`);
    process.exit(1);
  }
}
// The launcher owns port selection and passes the actual addresses down; append
// them so the model always calls the services on this run's ports rather than
// any address hard-coded in the prose.
const runtimeEndpoints =
  "\n\n---\n\n# Runtime endpoints\n\n" +
  "These services were started for this run; use exactly these addresses:\n" +
  `- static (schema): ${staticBase}\n` +
  `- log (records): ${logBase}\n` +
  `- ai (this service): http://localhost${addr}\n`;
const systemPrompt = loadSystemPrompt(root) + runtimeEndpoints;

const registry = new Registry({
  root,
  logBase,
  systemPrompt,
  model: flags.model, // e.g. "deepseek/deepseek-chat", "anthropic/claude-sonnet-4-6"
});
await registry.init();
if (registry.stub) {
  console.error(
    "warning: no authenticated LLM provider found (env vars or " +
      "pi's auth.json); ai falls back to echo stub",
  );
} else {
  console.log(`corazon ai: model=${registry.modelInfo}`);
}
console.log(`corazon ai: log=${logBase}`);
serve(registry, addr);
