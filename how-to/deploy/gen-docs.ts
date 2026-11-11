// gen-docs.ts — generate the per-interface docs from structure/.
//
//   bun how-to/deploy/gen-docs.ts <project dir> <out dir>
//
// Input  (under <project dir>/structure/):
//   atoms/**/*.yaml      what each atom provides: interface id, method, path
//   contracts/**/*.yaml  one contract per interface: description, request, response, errors
// Output (<out dir>/, normally structure/docs itself, committed):
//   <interface id>.md    one file per interface — generated, rewritten on every run
//   README.md            the overview — NOT generated: it is kept by hand / by the agent, who
//                        revises the previous README against what this run reports changed
//
// Prints what changed (added / removed / changed interface files) so the README can be
// brought up to date from it. Fails (non-zero, names the offender) when
//   - a contract is provided by no atom, or an atom provides an interface with no contract;
//   - README.md does not link every interface (or links one that does not exist), so a
//     pack cannot ship an overview that has drifted from the interfaces.
// Contract sections are copied as written (comments included): the comments are the
// explanations. No dependencies: Bun parses the YAML.

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [projectDir, outDir] = process.argv.slice(2);
if (!projectDir || !outDir) {
  console.error("usage: bun gen-docs.ts <project dir> <out dir>");
  process.exit(2);
}

function yamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...yamlFiles(p));
    else if (name.endsWith(".yaml")) out.push(p);
  }
  return out;
}

interface Endpoint {
  id: string;
  method: string;
  path: string;
  atom: string;
}
interface Contract {
  id: string;
  file: string;
  text: string;
  description: string;
}

const problems: string[] = [];

// --- atoms: who provides which interface -----------------------------------
const provided = new Map<string, Endpoint>();
for (const file of yamlFiles(join(projectDir, "structure/atoms"))) {
  const doc = Bun.YAML.parse(readFileSync(file, "utf8")) as any;
  for (const atom of doc?.atoms ?? []) {
    for (const itf of atom?.interfaces?.provides ?? []) {
      const ep: Endpoint = {
        id: String(itf.id),
        method: String(itf.extend?.method ?? ""),
        path: String(itf.extend?.path ?? ""),
        atom: String(atom.name),
      };
      if (!ep.id || !ep.method || !ep.path) {
        problems.push(`atom ${atom.name}: interface ${ep.id || "(no id)"} lacks id / method / path`);
        continue;
      }
      if (provided.has(ep.id)) problems.push(`interface ${ep.id} is provided twice`);
      provided.set(ep.id, ep);
    }
  }
}

// --- contracts --------------------------------------------------------------
const contracts = new Map<string, Contract>();
for (const file of yamlFiles(join(projectDir, "structure/contracts"))) {
  const text = readFileSync(file, "utf8");
  const doc = Bun.YAML.parse(text) as any;
  const id = String(doc?.id ?? "");
  if (!id) {
    problems.push(`contract ${file} has no id`);
    continue;
  }
  contracts.set(id, { id, file, text, description: String(doc.description ?? "").trim() });
}

for (const id of contracts.keys()) {
  if (!provided.has(id)) problems.push(`contract ${id} is provided by no atom`);
}
for (const id of provided.keys()) {
  if (!contracts.has(id)) problems.push(`interface ${id} has no contract`);
}

if (problems.length) {
  console.error("gen-docs: " + problems.length + " problem(s):");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

// --- one file per interface -------------------------------------------------

// section returns the raw lines under a top-level key, dedented by two spaces.
function section(text: string, key: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(key + ":"));
  if (start < 0) return "";
  const rest = lines[start].slice(key.length + 1).trim();
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l !== "" && !l.startsWith(" ") && !l.startsWith("#")) break; // next top-level key
    body.push(l.startsWith("  ") ? l.slice(2) : l);
  }
  while (body.length && body[body.length - 1].trim() === "") body.pop();
  const inline = rest && !rest.startsWith("#") ? [rest] : [];
  return [...inline, ...body].join("\n");
}

// The wire is YAML in, YAML out; a stream is SSE. The contract's `request:` may
// be `{}` (nothing to send).
function block(text: string): string {
  return "```yaml\n" + (text || "{}") + "\n```";
}

// The previous run's files (everything but README.md) are cleared first, so an
// interface that was removed does not leave its file behind — and kept in memory,
// to report what changed.
mkdirSync(outDir, { recursive: true });
const before = new Map<string, string>();
for (const name of readdirSync(outDir)) {
  if (!name.endsWith(".md") || name === "README.md") continue;
  before.set(name, readFileSync(join(outDir, name), "utf8"));
  rmSync(join(outDir, name));
}

const after = new Map<string, string>();
for (const [id, c] of contracts) {
  const ep = provided.get(id)!;
  const request = section(c.text, "request");
  const response = section(c.text, "response");
  const errors = section(c.text, "errors");
  const parts = [
    `# ${ep.method} ${ep.path}`,
    "",
    c.description,
    "",
    "## Request",
    "",
    block(request),
    "",
    "## Response",
    "",
    block(response),
  ];
  if (errors) parts.push("", "## Errors", "", block(errors));
  const text = parts.join("\n") + "\n";
  after.set(`${id}.md`, text);
  writeFileSync(join(outDir, `${id}.md`), text);
}

const added = [...after.keys()].filter((n) => !before.has(n));
const removed = [...before.keys()].filter((n) => !after.has(n));
const changed = [...after.keys()].filter((n) => before.has(n) && before.get(n) !== after.get(n));
console.log(`gen-docs: ${after.size} interfaces -> ${outDir}`);
for (const [label, names] of [["added", added], ["removed", removed], ["changed", changed]] as const) {
  if (names.length) console.log(`  ${label}: ${names.map((n) => n.replace(/\.md$/, "")).join(", ")}`);
}

// --- README must account for every interface --------------------------------
let readme = "";
try {
  readme = readFileSync(join(outDir, "README.md"), "utf8");
} catch {
  // reported below
}
const linked = new Set([...readme.matchAll(/\]\(([a-z0-9-]+)\.md\)/g)].map((m) => m[1]));
const drift: string[] = [];
if (!readme) drift.push("README.md is missing");
for (const id of provided.keys()) if (!linked.has(id)) drift.push(`README.md does not list ${id}`);
for (const id of linked) if (!provided.has(id)) drift.push(`README.md links ${id}, which is not an interface`);
if (drift.length) {
  console.error("gen-docs: README.md is out of date:");
  for (const d of drift) console.error("  - " + d);
  process.exit(1);
}
