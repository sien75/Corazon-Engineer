import YAML from "yaml";

// A user turn can mix text and images. `blocks` preserves their order; `content`
// is the flattened text projection kept for preview/search (images are ignored
// or shown as a placeholder).
export interface MessageBlock {
  type: "text" | "image";
  text?: string;
  sha256?: string;
  mimeType?: string;
  size?: number;
}

export interface ConversationMessage {
  seq: number;
  msgKind: string;
  content: string;
  blocks?: MessageBlock[];
}

// record writes a conversation record to the log service (fire-and-forget;
// logging must never block or break the chat flow).
export function record(
  logBase: string,
  sessionId: string,
  seq: number,
  msgKind: string,
  content: string,
  blocks?: MessageBlock[],
): void {
  if (!logBase) return;
  const payload: Record<string, unknown> = { seq, msgKind, content };
  if (blocks && blocks.length) payload.blocks = blocks;
  const body = YAML.stringify({
    op: "add",
    kind: "conversation",
    sessionId,
    payload,
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
    return raw.map((m: any) => {
      const msg: ConversationMessage = {
        seq: Number(m?.seq ?? 0),
        msgKind: String(m?.msgKind ?? ""),
        content: String(m?.content ?? ""),
      };
      if (Array.isArray(m?.blocks) && m.blocks.length) {
        msg.blocks = m.blocks.filter(
          (b: any) => b && (b.type === "text" || b.type === "image"),
        );
      }
      return msg;
    });
  } catch {
    return [];
  }
}
