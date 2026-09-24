import { appendFileSync } from "node:fs";

// Debug: set ENGINEER_AI_DEBUG=/path/to/log to trace all pi + engineer events.
const DEBUG = process.env.ENGINEER_AI_DEBUG;

export function dbg(...args: unknown[]): void {
  if (!DEBUG) return;
  appendFileSync(
    DEBUG,
    `${new Date().toISOString()} ${args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ")}\n`,
  );
}
