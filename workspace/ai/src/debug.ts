import { appendFileSync } from "node:fs";

// Debug: set CORAZON_AI_DEBUG=/path/to/log to trace all pi + corazon events.
const DEBUG = process.env.CORAZON_AI_DEBUG;

export function dbg(...args: unknown[]): void {
  if (!DEBUG) return;
  appendFileSync(
    DEBUG,
    `${new Date().toISOString()} ${args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ")}\n`,
  );
}
