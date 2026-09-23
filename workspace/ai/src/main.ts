import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Registry } from "./registry.ts";
import { serve } from "./server.ts";

// usage: bun run src/main.ts [--addr :7501] [--root <project dir>]
//        [--log http://localhost:7503] [--static http://localhost:7502]
//        [--agents <AGENTS.md>] [--model provider/model-id]

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

// The system prompt is the tool's own spec — how the agent behaves (verbs). A
// project's agents/ files describe that project (nouns); they are never read
// here. Default: the installed tool's copy. Launchers pass --agents explicitly
// instead, so the packaged case works from wherever the package sits and dev
// runs from the checkout.
function resolveAgentsFile(explicit?: string): string {
  const file = explicit
    ? path.resolve(explicit)
    : path.join(homedir(), ".corazon", "apps", "current", "agents", "AGENTS.md");
  if (!existsSync(file)) {
    console.error(`corazon ai: agents/AGENTS.md not found at ${file}`);
    process.exit(1);
  }
  return file;
}

const agentsFile = resolveAgentsFile(flags.agents);
// The launcher owns port selection and passes the actual addresses down; append
// them so the model always calls the services on this run's ports rather than
// any address hard-coded in the prose.
const runtimeEndpoints =
  "\n\n---\n\n# Runtime endpoints\n\n" +
  "These services were started for this run; use exactly these addresses:\n" +
  `- static (schema): ${staticBase}\n` +
  `- log (records): ${logBase}\n` +
  `- ai (this service): http://localhost${addr}\n`;
const systemPrompt = readFileSync(agentsFile, "utf8") + runtimeEndpoints;

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
console.log(`corazon ai: spec=${agentsFile}`);
serve(registry, addr);
