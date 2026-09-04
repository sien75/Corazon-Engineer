import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { dbg } from "./debug.ts";

// The model's entire capability surface is defined here: one HTTP tool
// (network-only, implemented with fetch — no shell, no filesystem) and one
// cli tool (any program, spawned with argv arrays — no shell interpretation,
// so injection via ";", "&&", "$()" etc. is impossible). pi's built-in file
// tools (read/write/edit/grep/find/ls/bash) are all disabled via
// noTools: "builtin" in the session options. http calls never require
// approval; cli calls are gated per program by the registry's
// beforeToolCall hook (first use pops an approval card).

const MAX_OUTPUT = 100 * 1024; // 100 KB cap per tool result
const HTTP_TIMEOUT_MS = 30_000;
const CLI_TIMEOUT_MS = 60_000;

function cap(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT) + `\n... [truncated at ${MAX_OUTPUT} bytes]`;
}

export function createHttpTool() {
  return defineTool({
    name: "http",
    label: "HTTP Request",
    description:
      "Make an HTTP request (e.g. call Corazon's internal static / log APIs, " +
      "query external endpoints). Network-only: no filesystem or shell access.",
    parameters: Type.Object({
      method: Type.String({
        description: "HTTP method: GET, POST, PUT, DELETE, ...",
      }),
      url: Type.String({ description: "http:// or https:// URL" }),
      headers: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description: "request headers",
        }),
      ),
      body: Type.Optional(Type.String({ description: "request body" })),
    }),
    execute: async (_id, params) => {
      dbg("http tool →", params.method, params.url);
      const url = new URL(params.url); // throws on invalid URL
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`scheme not allowed: ${url.protocol} (http/https only)`);
      }
      const resp = await fetch(url, {
        method: params.method.toUpperCase(),
        headers: params.headers,
        body: params.body,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const text = cap(await resp.text());
      dbg("http tool ←", resp.status, params.url);
      return {
        content: [
          { type: "text", text: `HTTP ${resp.status}\n\n${text}` },
        ],
        details: { status: resp.status },
      };
    },
  });
}

export function createCliTool() {
  return defineTool({
    name: "cli",
    label: "CLI",
    description:
      "Run a local CLI program (psql, redis-cli, kubectl, ... — any program). " +
      "Arguments are passed as an array directly to the program — no shell is " +
      "involved, so pipes/redirects/chaining are not available. The first use " +
      "of each program requires user approval; afterwards it runs freely. " +
      "For HTTP calls use the http tool instead.",
    parameters: Type.Object({
      program: Type.String({ description: "program name or path" }),
      args: Type.Optional(
        Type.Array(Type.String(), { description: "program arguments" }),
      ),
    }),
    execute: async (_id, params) => {
      dbg("cli tool →", params.program, params.args);
      const proc = Bun.spawn([params.program, ...(params.args ?? [])], {
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });
      const timer = setTimeout(() => proc.kill(), CLI_TIMEOUT_MS);
      try {
        const [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        const code = await proc.exited;
        dbg("cli tool ←", params.program, "exit", code);
        const out = cap(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`);
        return {
          content: [{ type: "text", text: `exit ${code}\n\n${out}` }],
          details: { exitCode: code },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
