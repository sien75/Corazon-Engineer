import YAML from "yaml";

export interface ConversationMessage {
  seq: number;
  msgKind: string;
  content: string;
}

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

// fetchMessages reads a session's conversation history (text only) from the log
// service, used to rebuild an agent session's context on resume.
export async function fetchMessages(
  logBase: string,
  sessionId: string,
): Promise<ConversationMessage[]> {
  if (!logBase) return [];
  try {
    const res = await fetch(`${logBase}/log/session-detail`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: YAML.stringify({ sessionId }),
    });
    if (!res.ok) return [];
    const data = YAML.parse(await res.text());
    const raw = Array.isArray(data?.messages) ? data.messages : [];
    return raw.map((m: any) => ({
      seq: Number(m?.seq ?? 0),
      msgKind: String(m?.msgKind ?? ""),
      content: String(m?.content ?? ""),
    }));
  } catch {
    return [];
  }
}
