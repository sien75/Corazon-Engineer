import YAML from "yaml";

// record writes a conversation record to the log service (fire-and-forget;
// logging must never block or break the chat flow).
export function record(
  logBase: string,
  sessionId: string,
  seq: number,
  msgKind: string,
  content: string,
): void {
  if (!logBase) return;
  const body = YAML.stringify({
    op: "add",
    kind: "conversation",
    sessionId,
    payload: { seq, msgKind, content },
  });
  fetch(`${logBase}/log/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body,
  })
    .then((r) => r.text())
    .catch(() => {});
}
