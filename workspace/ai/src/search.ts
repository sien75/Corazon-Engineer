// web_search: one tool, several providers underneath. The tool surface (name,
// arguments, how results read) is the same whichever provider answers; a
// provider is one entry in PROVIDERS below, so adding the next one is an entry,
// not a tool.
//
// The credential never passes through the model: it is the key pi already holds
// for that provider (auth.json), or the provider's own environment variable. A
// search that cannot find a key fails and says so — an empty result would read
// as "the web has nothing on this", which is a different and wrong answer.

import { Type } from "typebox";
import { defineTool, readStoredCredential } from "@earendil-works/pi-coding-agent";

export interface WebSearchDeps {
  // fetch override; the default is the runtime's own.
  fetch?: typeof fetch;
  // keyFor resolves a provider's API key. Absent = pi's config, then env.
  keyFor?: (provider: string) => string | undefined;
}

type Hit = {
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
  site?: string;
  date?: string;
  authority?: number;
  score?: number;
};

type Provider = {
  // What the model sees when it names this provider.
  label: string;
  // The environment variable that can carry the key instead of pi's auth.json.
  env: string;
  search: (args: { query: string; count: number; question?: string }, key: string, f: typeof fetch) => Promise<Hit[]>;
};

const TIMEOUT_MS = 25_000;
// Long abstracts are the point (they are what the model reads), but a stray
// 8 KB page summary should not eat the context in one hit.
const ABSTRACT_LIMIT = 1200;

// The API's own error shape: { error: { message, type, param, code } }. The text
// the model gets should be the reason, not a number it has to guess at.
async function apiError(res: Response, provider: string): Promise<Error> {
  let detail = "";
  try {
    const body: any = await res.json();
    detail = String(body?.error?.message ?? body?.message ?? "").trim();
  } catch {
    // not JSON — the status alone will have to do
  }
  const hint =
    res.status === 401
      ? "the key is missing or invalid"
      : res.status === 402
        ? "the account is out of balance"
        : res.status === 403
          ? "rejected by the provider's safety policy"
          : res.status === 429
            ? "rate limited (QPS) — wait a moment and try again"
            : res.status >= 500
              ? "the provider's server failed — try again later"
              : "the request was rejected";
  return new Error(
    `${provider} search failed: HTTP ${res.status} — ${hint}${detail ? `: ${detail}` : ""}`,
  );
}

const PROVIDERS: Record<string, Provider> = {
  deepseek: {
    label: "DeepSeek 网页搜索",
    env: "DEEPSEEK_API_KEY",
    async search({ query, count, question }, key, f) {
      const res = await f("https://api.deepseek.com/v1/tools/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          count,
          // The caller's own wording; the provider uses it to read intent.
          ...(question ? { ori_question: question } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw await apiError(res, "deepseek");
      const body: any = await res.json();
      const results = Array.isArray(body?.results) ? body.results : [];
      return results.map(
        (r: any): Hit => ({
          title: String(r?.title ?? "").trim() || "(untitled)",
          url: String(r?.url ?? "").trim(),
          snippet: String(r?.snippet ?? ""),
          summary: String(r?.summary ?? ""),
          site: r?.site_name ? String(r.site_name) : undefined,
          date: r?.date ? String(r.date) : undefined,
          authority: Number.isFinite(Number(r?.authority)) ? Number(r.authority) : undefined,
          score: Number.isFinite(Number(r?.rerank_score)) ? Number(r.rerank_score) : undefined,
        }),
      );
    },
  },
};

// A key stored as "$SOMETHING" is a reference to the environment, not a secret —
// pi resolves those the same way wherever a provider names its key.
function deref(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!v.startsWith("$")) return v;
  const fromEnv = process.env[v.slice(1)]?.trim();
  return fromEnv || undefined;
}

// defaultKeyFor: pi's own credential store first (the key the conversation is
// already using), then the provider's environment variable.
export function defaultKeyFor(provider: string): string | undefined {
  const env = PROVIDERS[provider]?.env;
  const fromEnv = env ? process.env[env]?.trim() : undefined;
  if (fromEnv) return fromEnv;
  try {
    // No path: pi's own default, <agentDir>/auth.json — the same file the
    // conversation's own provider key comes from.
    const cred = readStoredCredential(provider);
    if (cred && cred.type === "api_key" && cred.key) return deref(cred.key);
  } catch {
    // no auth.json / unreadable: the env var was the only other chance
  }
  return undefined;
}

function cut(text: string | undefined): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  return t.length > ABSTRACT_LIMIT ? `${t.slice(0, ABSTRACT_LIMIT)}…` : t;
}

// render is the text the model reads: enough per hit to judge it without a
// second request, one line per fact so it stays scannable.
function render(provider: string, query: string, hits: Hit[]): string {
  if (!hits.length) {
    return `web_search · ${provider} · "${query}" — no results.`;
  }
  const lines: string[] = [`web_search · ${provider} · "${query}" · ${hits.length} result(s)`, ""];
  hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.title}`);
    if (h.url) lines.push(`   ${h.url}`);
    const meta: string[] = [];
    if (h.site) meta.push(h.site);
    if (h.date) meta.push(h.date);
    if (typeof h.authority === "number") meta.push(`authority ${h.authority}`);
    if (typeof h.score === "number") meta.push(`score ${h.score.toFixed(2)}`);
    if (meta.length) lines.push(`   ${meta.join(" · ")}`);
    const body = cut(h.summary) || cut(h.snippet);
    if (body) lines.push(`   ${body.replace(/\s*\n+\s*/g, " ")}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

function ok(text: string, details: unknown = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function fail(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { error: text },
    isError: true,
  };
}

const NAMES = Object.keys(PROVIDERS);

export function makeWebSearchTool(deps: WebSearchDeps = {}) {
  const f = deps.fetch ?? fetch;
  const keyFor = deps.keyFor ?? defaultKeyFor;
  return defineTool({
    name: "web_search",
    label: "Web search",
    description:
      "Search the live web and get back titles, URLs and abstracts. Providers: " +
      `${NAMES.join(", ")} (default ${NAMES[0]}). Use it when an answer depends on ` +
      "things that change — releases, versions, prices, news, an error whose fix " +
      "is newer than your training — and cite the URLs you actually read. Do not " +
      "use it for things you already know or for reading a local repo. Each call " +
      "is billed, so search once and well rather than many times.",
    promptSnippet: "web_search: search the live web (provider default deepseek)",
    parameters: Type.Object({
      query: Type.String({
        description:
          "What to search for, 1-128 characters. The provider understands " +
          "site:, -site:, -word, \"exact phrase\", lang:zh,en, after:2025-01-01 " +
          "and before:… operators.",
      }),
      count: Type.Optional(
        Type.Number({ description: "How many results, 1-50 (default 8)" }),
      ),
      provider: Type.Optional(
        Type.String({ description: `Which provider answers: ${NAMES.join(" | ")} (default ${NAMES[0]})` }),
      ),
      question: Type.Optional(
        Type.String({
          description:
            "The user's original question in their words, when the query is a " +
            "rewrite of it — it helps the provider read intent",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const query = String(params.query ?? "").trim();
      if (!query) return fail("web_search needs a query");
      if (query.length > 128) return fail(`query is ${query.length} characters; the limit is 128`);
      const count = Math.max(1, Math.min(50, Math.round(Number(params.count ?? 8)) || 8));
      const name = String(params.provider ?? "").trim() || NAMES[0];
      const provider = PROVIDERS[name];
      if (!provider) {
        return fail(`no such search provider: ${name} (available: ${NAMES.join(", ")})`);
      }

      const key = keyFor(name);
      if (!key) {
        return fail(
          `no ${name} key. pi holds no ${name} credential and ${provider.env} is ` +
            `not set — log in / configure ${name} in pi, or export ${provider.env}.`,
        );
      }

      let hits: Hit[];
      try {
        hits = await provider.search(
          { query, count, question: String(params.question ?? "").trim() || undefined },
          key,
          f,
        );
      } catch (err: any) {
        // A timeout is worth naming as one: the model's next move differs.
        if (err?.name === "TimeoutError" || err?.name === "AbortError") {
          return fail(`${name} search timed out after ${TIMEOUT_MS / 1000}s`);
        }
        return fail(String(err?.message ?? err));
      }

      return ok(render(name, query, hits), { provider: name, query, count, results: hits });
    },
  });
}
