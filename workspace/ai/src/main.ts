import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Registry } from "./registry.ts";
import { serve } from "./server.ts";

// Local service-to-service calls (ai → log) must never be proxied. A system
// proxy exported as http_proxy / https_proxy (e.g. Clash) also captures
// localhost: the request reaches the remote proxy and returns 502, which
// silently breaks history reads (resume → "session not found") and record
// writes (conversations never reach sqlite). Bun's fetch honors NO_PROXY;
// bypass only the loopback names so external LLM-provider calls stay proxied.
function withLocalNoProxy(value: string | undefined): string {
  const hosts = new Set(
    (value ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  );
  for (const h of ["localhost", "127.0.0.1", "::1"]) hosts.add(h);
  return [...hosts].join(",");
}
process.env.no_proxy = withLocalNoProxy(process.env.no_proxy);
process.env.NO_PROXY = withLocalNoProxy(process.env.NO_PROXY);

// usage: bun run src/main.ts [--addr :7501] [--root <project dir>]
//        [--log http://localhost:7503] [--static http://localhost:7502]
//        [--agents <AGENTS.md>] [--model provider/model-id] [--stub]

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    // Boolean flags take no value, so they never swallow the next argument.
    if (key === "stub") {
      out[key] = "1";
      continue;
    }
    if (i + 1 < argv.length) out[key] = argv[++i];
  }
  return out;
}

function findRoot(): string {
  let dir = process.cwd();
  for (;;) {
    try {
      readFileSync(path.join(dir, "engineer.yaml"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        console.error("engineer.yaml not found in any parent directory");
        process.exit(1);
      }
      dir = parent;
    }
  }
}

const flags = parseFlags(process.argv.slice(2));
const forceStub = flags.stub === "1";
const root = flags.root || findRoot();
const addr = flags.addr || "127.0.0.1:7501";
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
    : path.join(homedir(), ".engineer", "apps", "current", "agents", "AGENTS.md");
  if (!existsSync(file)) {
    console.error(`engineer ai: agents/AGENTS.md not found at ${file}`);
    process.exit(1);
  }
  return file;
}

const agentsFile = resolveAgentsFile(flags.agents);
// The address the model should call this service by: a wildcard or loopback
// bind is reached as localhost; anything else (the launcher opened the stack to
// a specific interface) keeps its host.
function aiBaseURL(a: string): string {
  const i = a.lastIndexOf(":");
  const host = i < 0 ? a : a.slice(0, i);
  const port = i < 0 ? "" : a.slice(i + 1);
  const local = host === "" || host === "0.0.0.0" || host === "::" ||
    host === "::1" || host === "localhost" || host.startsWith("127.");
  return `http://${local ? "localhost" : host}:${port}`;
}

// The launcher owns port selection and passes the actual addresses down; append
// them so the model always calls the services on this run's ports rather than
// any address hard-coded in the prose.
const runtimeEndpoints =
  "\n\n---\n\n# Runtime endpoints\n\n" +
  "These services were started for this run; use exactly these addresses:\n" +
  `- static (schema): ${staticBase}\n` +
  `- log (records): ${logBase}\n` +
  `- ai (this service): ${aiBaseURL(addr)}\n`;
const systemPrompt = readFileSync(agentsFile, "utf8") + runtimeEndpoints;

const registry = new Registry({
  root,
  logBase,
  systemPrompt,
  model: flags.model, // e.g. "deepseek/deepseek-chat", "anthropic/claude-sonnet-4-6"
  forceStub,
});
await registry.init();
if (registry.stub) {
  console.error(
    forceStub
      ? "engineer ai: --stub: model calls disabled (echo stub)"
      : "warning: no authenticated LLM provider found (env vars or " +
          "pi's auth.json); ai falls back to echo stub",
  );
} else {
  console.log(`engineer ai: model=${registry.modelInfo}`);
}
console.log(`engineer ai: log=${logBase}`);
console.log(`engineer ai: spec=${agentsFile}`);
serve(registry, addr);
