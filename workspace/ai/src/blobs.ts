import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// Images live as raw bytes under <root>/uploads, named by content hash so
// identical uploads dedupe to one file. Only the hash + mime + size travel
// through storage; base64 is materialized on demand when feeding pi.

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
  return path.join(root, "uploads");
}

// legacyUploadsDir is where uploads lived before the data home stopped nesting a
// second .engineer inside itself: <root>/.engineer/uploads.
export function legacyUploadsDir(root: string): string {
  return path.join(root, ".engineer", "uploads");
}

// migrateUploads moves images out of the old nested folder, once, at startup.
// Uploads are content addressed, so a name can never collide with a different
// picture: an existing file is simply the same image already moved.
export function migrateUploads(root: string): number {
  const old = legacyUploadsDir(root);
  if (!existsSync(old)) return 0;
  const dir = uploadsDir(root);
  mkdirSync(dir, { recursive: true });
  let moved = 0;
  for (const name of readdirSync(old)) {
    const from = path.join(old, name);
    try {
      const info = lstatSync(from);
      if (!info.isFile()) continue;
      const to = path.join(dir, name);
      if (!existsSync(to)) renameSync(from, to);
      else unlinkSync(from);
      moved++;
    } catch {
      // A file that cannot be moved stays where it is; the store keeps working.
    }
  }
  try {
    rmdirSync(old);
  } catch {
    // Whatever is left in the old folder is not ours to force.
  }
  return moved;
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

// findBlobFile is the one place a content address becomes a path on disk: the
// stored name is the hash plus the mime's extension, so it is looked up rather
// than guessed. Exported because the image tool takes references by address too.
export function findBlobFile(root: string, sha256: string): string | undefined {
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
