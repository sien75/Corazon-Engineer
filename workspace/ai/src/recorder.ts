import YAML from "yaml";

// A persisted conversation record. `role` is the pi message role (user /
// assistant / toolResult) or "compaction" for a context-compaction entry.
// `content` is a derived plain-text projection used by the session list preview
// and search. `raw` is the pi message (or compaction entry) verbatim — the
// source of truth for replay and context rebuild — except that image bytes are
// externalized to content-addressed refs and re-inlined on read.
export interface StoredRecord {
  seq: number;
  role: string;
  content: string;
  raw?: any;
  // Legacy rows (written before raw storage) carry ordered text/image blocks.
  blocks?: any[];
}

// The image block written into `raw` in place of pi's inline base64.
export interface ImageRefBlock {
  type: "image";
  sha256: string;
  mimeType: string;
  size?: number;
}

// record writes a conversation record to the log service (fire-and-forget;
// logging must never block or break the chat flow).
export function record(
  logBase: string,
  sessionId: string,
  seq: number,
  role: string,
  content: string,
  raw?: unknown,
): void {
  if (!logBase) return;
  const payload: Record<string, unknown> = { seq, role, content };
  if (raw !== undefined) payload.raw = raw;
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

// fetchRecords reads a session's conversation records in order. New rows carry
// `raw`; legacy rows (msgKind/blocks/content) are returned as-is for fallback.
export async function fetchRecords(
  logBase: string,
  sessionId: string,
): Promise<StoredRecord[]> {
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
    return raw.map((m: any): StoredRecord => {
      const rec: StoredRecord = {
        seq: Number(m?.seq ?? 0),
        role: String(m?.role ?? m?.msgKind ?? ""),
        content: String(m?.content ?? ""),
      };
      if (m?.raw !== undefined && m?.raw !== null) rec.raw = m.raw;
      if (Array.isArray(m?.blocks) && m.blocks.length) rec.blocks = m.blocks;
      return rec;
    });
  } catch {
    return [];
  }
}

// externalizeImages replaces inline base64 image blocks in a message's content
// with content-addressed refs, saving the bytes to the blob store. Non-image
// content is returned untouched. `save` is saveImage from blobs.ts.
export function externalizeImages(
  message: any,
  save: (base64: string, mimeType: string) => { sha256: string; size: number },
): any {
  if (!message || !Array.isArray(message.content)) return message;
  let changed = false;
  const content = message.content.map((b: any) => {
    if (b && b.type === "image" && typeof b.data === "string" && b.mimeType) {
      changed = true;
      const ref = save(b.data, b.mimeType);
      return { type: "image", sha256: ref.sha256, mimeType: b.mimeType, size: ref.size };
    }
    return b;
  });
  return changed ? { ...message, content } : message;
}

// inlineImages is the inverse of externalizeImages: image refs become pi's
// inline base64 blocks again, for feeding pi and for sending to the frontend.
// `load` is loadImage from blobs.ts.
export function inlineImages(
  message: any,
  load: (sha256: string) => { data: string; mimeType: string } | undefined,
): any {
  if (!message || !Array.isArray(message.content)) return message;
  let changed = false;
  const content = message.content.map((b: any) => {
    if (b && b.type === "image" && b.sha256 && !b.data) {
      const img = load(b.sha256);
      if (!img) return b;
      changed = true;
      return { type: "image", data: img.data, mimeType: img.mimeType };
    }
    return b;
  });
  return changed ? { ...message, content } : message;
}

// projectText is the plain-text projection stored alongside `raw` for list
// preview / search: text blocks joined; images become "[image]". Tool results
// and compaction entries project to "".
export function projectText(role: string, message: any): string {
  if (role === "toolResult" || role === "compaction") return "";
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (b?.type === "text" && b.text) parts.push(b.text);
    else if (b?.type === "image") parts.push("[image]");
  }
  return parts.join("\n");
}
