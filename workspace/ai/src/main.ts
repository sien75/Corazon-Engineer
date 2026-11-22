import { Registry } from "./registry.ts";
import { serve } from "./server.ts";
import { modelsConfigPath } from "./models-config.ts";
import { migrateUploads } from "./blobs.ts";

// Local service-to-service calls (ai → storage) must never be proxied. A system
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

// usage: bun run src/main.ts --bind <host> --port <n> --home <data dir>
//        --storage <url> [--stub]
//
// Every flag above is required and there is no fallback. The launcher owns the
// addresses and the home directory and passes them down; a service that invents a
// default silently talks to a port nobody chose.
//
// ai injects no spec, no reference files and no interface docs: those describe a
// caller's world, and the caller passes what it wants through /ai/new's `system`.
// The home is only this service's own data — uploaded images.
const USAGE =
  "usage: engineer-ai --bind <host> --port <n> --home <data dir> " +
  "--storage <url> [--stub]";

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

const flags = parseFlags(process.argv.slice(2));

const REQUIRED = ["bind", "port", "home", "storage"];
const missing = REQUIRED.filter((k) => !flags[k]);
if (missing.length || !/^\d+$/.test(flags.port ?? "")) {
  if (missing.length) {
    console.error(
      `engineer ai: missing required flag(s): ${missing.map((k) => `--${k}`).join(", ")}`,
    );
  } else {
    console.error(`engineer ai: --port must be a number, got ${JSON.stringify(flags.port)}`);
  }
  console.error(USAGE);
  process.exit(2);
}

const forceStub = flags.stub === "1";
const home = flags.home;
const addr = `${flags.bind}:${flags.port}`;
const storageBase = flags.storage;

// One-way, at startup: images used to live in <home>/.engineer/uploads, a folder
// nested inside the data home itself. They now sit in <home>/uploads.
const movedUploads = migrateUploads(home);
if (movedUploads > 0) {
  console.log(`engineer ai: moved ${movedUploads} image(s) to ${home}/uploads`);
}

const registry = new Registry({ home, storageBase, forceStub });
await registry.init();
if (registry.stub) {
  console.error(
    forceStub
      ? "engineer ai: --stub: model calls disabled (echo stub)"
      : "warning: no authenticated LLM provider found (env vars or " +
          "pi's auth.json); ai falls back to echo stub",
  );
}
console.log(`engineer ai: storage=${storageBase}`);
console.log(`engineer ai: models=${modelsConfigPath(home)}`);
serve(registry, addr);
