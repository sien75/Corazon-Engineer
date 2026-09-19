import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

// Images live as raw bytes under <root>/.corazon/uploads, named by content hash
// so identical uploads dedupe to one file. Only the hash + mime + size travel
// through the log; base64 is materialized on demand when feeding pi.

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function uploadsDir(root: string): string {
  return path.join(root, ".corazon", "uploads");
}

function extFor(mimeType: string): string {
  return EXT[mimeType] ?? "bin";
}

// saveImage decodes base64, writes it atomically (tmp + rename) and returns the
// content address. Repeated calls with the same bytes are no-ops.
export function saveImage(
  root: string,
  base64: string,
  mimeType: string,
): { sha256: string; size: number } {
  const bytes = Buffer.from(base64, "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dir = uploadsDir(root);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sha256}.${extFor(mimeType)}`);
  if (!existsSync(file)) {
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, file);
  }
  return { sha256, size: bytes.length };
}

function findBlobFile(root: string, sha256: string): string | undefined {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return undefined;
  const dir = uploadsDir(root);
  if (!existsSync(dir)) return undefined;
  const name = readdirSync(dir).find(
    (f) => f === sha256 || f.startsWith(`${sha256}.`),
  );
  return name ? path.join(dir, name) : undefined;
}

// loadImage returns base64 + mime for a stored blob, for rebuilding pi context.
export function loadImage(
  root: string,
  sha256: string,
): { data: string; mimeType: string } | undefined {
  const file = findBlobFile(root, sha256);
  if (!file) return undefined;
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return {
    data: readFileSync(file).toString("base64"),
    mimeType: MIME[ext] ?? "application/octet-stream",
  };
}

// readBlob returns raw bytes + mime for the /blobs GET route.
export function readBlob(
  root: string,
  sha256: string,
): { bytes: Uint8Array; mimeType: string } | undefined {
  const file = findBlobFile(root, sha256);
  if (!file) return undefined;
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return {
    bytes: readFileSync(file),
    mimeType: MIME[ext] ?? "application/octet-stream",
  };
}
