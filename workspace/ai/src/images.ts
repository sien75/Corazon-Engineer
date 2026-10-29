// image: generate a picture with this conversation's image model, and hand it to
// the page.
//
// Which model is not an argument. It is the session's image slot, resolved at
// build (the session row — a `model` tool switch or the creation-time choice —
// then the role's `image` in the engineer home's models.yaml). A model picking
// its own rendering model per call would be a second, unreviewed answer to a
// question the config already answers.
//
// The provider is not a code path. The provider half of `provider/model-id` is
// only used to find the baseUrl and the credential, both read through pi's own
// runtime (models.json + auth.json), so the key never passes through the model
// and nothing is stored here. What differs between gateways is the *request
// shape*, and there are only two in the wild:
//
//   1. OpenAI images: POST {baseUrl}/images/generations {model, prompt, n, size}
//      → {data:[{b64_json} | {url}]}. The clean shape; tried first.
//   2. Chat completions with image output: POST {baseUrl}/chat/completions
//      {model, messages, modalities:["image","text"]}
//      → choices[0].message.images[i].image_url.url (a data: URL or a link).
//      What a chat gateway (zenmux and friends) exposes when it has no images
//      endpoint. Tried when the first one is answered 404 / 405.
//
// `response_format` is deliberately never sent: the gpt-image family rejects it,
// the dall-e family defaults to a url. Both response shapes are decoded rather
// than asking each gateway which one it speaks.
//
// The bytes go to the same content-addressed store as a pasted image
// (<home>/.engineer/uploads/<sha256>.<ext>), so the picture is served by the
// same /blobs/<sha256> route and the log keeps only the reference.
//
// What the model reads back is text; the pixels ride in `details`, which the page
// draws. An image block in a toolResult would be replayed to every provider on
// every later turn (OpenAI's tool message is text-only, so it would not even
// survive) and would be paid for as context each time. A model that really needs
// to look at the picture can `read` the blob file — vision on demand.

import { Type } from "typebox";
import path from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { saveImage, uploadsDir } from "./blobs.ts";

export interface ImageToolDeps {
  // pi's runtime: provider baseUrl + credential. Absent only in stub mode, where
  // the tool reports that instead of inventing an endpoint.
  runtime?: ModelRuntime;
  // The engineer home — the blob store's root.
  home: string;
  // The image model this conversation is on (resolved at build).
  getImageModel: () => string | undefined;
  // fetch override; the default is the runtime's own.
  fetch?: typeof fetch;
}

// Generation is slow (tens of seconds on the big models) but not unbounded.
const TIMEOUT_MS = 180_000;
const DEFAULT_SIZE = "1024x1024";
const MAX_N = 4;
const MIME_DEFAULT = "image/png";

// One entry per model whose accepted sizes are narrower than the OpenAI default.
// Keyed by the full provider/model-id: the same model id on another gateway can
// differ, and a wrong size is a 400, not a resize.
const SIZES: Record<string, string[]> = {
  "openai/gpt-image-1": ["1024x1024", "1536x1024", "1024x1536"],
  "openai/gpt-image-2": ["1024x1024", "1536x1024", "1024x1536"],
};

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

// splitRef splits provider/model-id at the first slash: the id may itself
// contain slashes (black-forest-labs/flux.2-flex), the provider never does.
function splitRef(ref: string): { provider: string; id: string } | undefined {
  const i = ref.indexOf("/");
  if (i <= 0 || i >= ref.length - 1) return undefined;
  return { provider: ref.slice(0, i), id: ref.slice(i + 1) };
}

// sniffMime reads the magic bytes: gateways are loose about what they call the
// file, and a jpg stored as .png comes back with the wrong Content-Type.
function sniffMime(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  return MIME_DEFAULT;
}

// apiError turns the gateway's own error shape ({error:{message,type,code}}) into
// the sentence the model should read, with a plain-language hint for the statuses
// that mean "fix a config", not "retry".
async function apiError(res: Response, ref: string): Promise<Error> {
  let detail = "";
  try {
    const body: any = await res.json();
    detail = String(body?.error?.message ?? body?.error?.code ?? body?.message ?? "").trim();
  } catch {
    // not JSON — the status alone will have to do
  }
  const hint =
    res.status === 401
      ? "the provider rejected the credential"
      : res.status === 402
        ? "the account is out of balance"
        : res.status === 403
          ? "this key may not use the model"
          : res.status === 404
            ? "no such model or endpoint on this gateway"
            : res.status === 429
              ? "rate limited"
              : "";
  const parts = [`${ref}: HTTP ${res.status}`];
  if (hint) parts.push(hint);
  if (detail) parts.push(detail);
  return new Error(parts.join(" — "));
}

// A reference to image bytes, however the gateway phrased it.
type Picked = { b64?: string; url?: string };

function pickImages(payload: any): Picked[] {
  const out: Picked[] = [];
  const push = (v: any) => {
    if (!v) return;
    if (typeof v === "string") out.push({ url: v });
    else if (typeof v.b64_json === "string" && v.b64_json) out.push({ b64: v.b64_json });
    else if (typeof v.url === "string" && v.url) out.push({ url: v.url });
    else if (v.image_url?.url) push(v.image_url.url);
  };
  // Shape 1: {data:[…]}.
  if (Array.isArray(payload?.data)) payload.data.forEach(push);
  // Shape 2: {choices:[{message:{images:[…], content:[…]}}]}.
  for (const choice of Array.isArray(payload?.choices) ? payload.choices : []) {
    const msg = choice?.message ?? {};
    for (const img of Array.isArray(msg.images) ? msg.images : []) push(img);
    for (const part of Array.isArray(msg.content) ? msg.content : []) {
      if (part?.type === "image_url" || part?.type === "output_image") push(part);
    }
  }
  return out;
}

// toBytes resolves one picked reference into raw bytes. A data: URL is decoded in
// place; a link is fetched now, because a URL that expires in an hour is not a
// picture in a conversation.
async function toBytes(p: Picked, f: typeof fetch, signal: AbortSignal): Promise<Uint8Array> {
  if (p.b64) return new Uint8Array(Buffer.from(p.b64, "base64"));
  const url = String(p.url ?? "");
  const m = /^data:([^;,]+)?;base64,(.*)$/s.exec(url);
  if (m) return new Uint8Array(Buffer.from(m[2], "base64"));
  if (!url) throw new Error("the provider returned no image (neither base64 nor url)");
  const res = await f(url, { signal });
  if (!res.ok) throw new Error(`could not download the generated image: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function makeImageTool(deps: ImageToolDeps) {
  const f = deps.fetch ?? fetch;

  return defineTool({
    name: "image",
    label: "Image",
    description:
      "Generate a picture and show it in this conversation. Use it when the user " +
      "asks for an image, picture, drawing, poster, icon or a diagram drawn as a " +
      "picture — not for a chart or table that text can carry. It runs on this " +
      "conversation's image model (the `model` tool's `image` slot), which is not " +
      "an argument here. You get back a description and the hash of the file, not " +
      "the pixels: the user sees the picture already, and if you need to look at it " +
      "yourself, read the file path the result names. Each call is billed, so write " +
      "the prompt once and well.",
    promptSnippet: "image: generate a picture and show it in this conversation",
    parameters: Type.Object({
      prompt: Type.String({
        description:
          "What to draw, in the terms the requested style implies — subject, " +
          "composition, style, lighting, colours. Long and specific beats short.",
      }),
      size: Type.Optional(
        Type.String({
          description:
            `WIDTHxHEIGHT (default ${DEFAULT_SIZE}). Some models only accept a few ` +
            "shapes; an unsupported one fails with the supported list.",
        }),
      ),
      n: Type.Optional(
        Type.Number({ description: `How many pictures, 1-${MAX_N} (default 1)` }),
      ),
    }),
    execute: async (_toolCallId, params, signal) => {
      const prompt = String(params.prompt ?? "").trim();
      if (!prompt) return fail("image needs a prompt");

      const ref = String(deps.getImageModel() ?? "").trim();
      if (!ref) {
        return fail(
          "this conversation has no image model. Set `image` for its role in the " +
            "engineer home's models.yaml (main.image / sub.image), or switch it with " +
            "the `model` tool (slot: image).",
        );
      }
      const parts = splitRef(ref);
      if (!parts) return fail(`the image model is not provider/model-id: ${ref}`);
      if (!deps.runtime) {
        return fail("no pi runtime in this process (stub mode): nothing can generate images");
      }

      const n = Math.max(1, Math.min(MAX_N, Math.round(Number(params.n ?? 1)) || 1));
      const size = String(params.size ?? "").trim() || DEFAULT_SIZE;
      const allowed = SIZES[parts.id];
      if (allowed && !allowed.includes(size)) {
        return fail(`${ref} accepts only ${allowed.join(", ")}; not ${size}`);
      }

      // Where to call and with which key: pi's own provider config and
      // credential, never anything stored here.
      const provider = deps.runtime.getProvider(parts.provider);
      let baseUrl = String(
        (provider as any)?.baseUrl ?? deps.runtime.getRegisteredProviderConfig(parts.provider)?.baseUrl ?? "",
      )
        .trim()
        .replace(/\/+$/, "");
      let apiKey = "";
      const headers: Record<string, string> = {};
      try {
        for (const [k, v] of Object.entries(((provider as any)?.headers ?? {}) as Record<string, unknown>)) {
          headers[k] = String(v);
        }
        const auth = await deps.runtime.getAuth(parts.provider);
        if (!auth) {
          return fail(
            `pi holds no credential for ${parts.provider}; log in / configure it in ` +
              "pi, or point models.yaml's image slot at a provider pi can use.",
          );
        }
        apiKey = String(auth.auth?.apiKey ?? "");
        if (auth.auth?.baseUrl) baseUrl = String(auth.auth.baseUrl).trim().replace(/\/+$/, "");
        for (const [k, v] of Object.entries((auth.auth?.headers ?? {}) as Record<string, unknown>)) {
          headers[k] = String(v);
        }
      } catch (err: any) {
        return fail(`could not resolve the ${parts.provider} credential: ${String(err?.message ?? err)}`);
      }
      if (!baseUrl) {
        return fail(`pi knows no baseUrl for provider ${parts.provider} (models.json)`);
      }

      const timeout = AbortSignal.timeout(TIMEOUT_MS);
      const stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const send = async (route: string, body: unknown, shape: string) => {
        const res = await f(`${baseUrl}${route}`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal: stop,
        });
        if (!res.ok) return { res, error: await apiError(res, ref), shape };
        return { payload: await res.json(), shape };
      };

      // Shape 1 (images), then shape 2 (chat with image output) only when the
      // gateway says the images endpoint is not there — a 400 from shape 1 is a
      // real answer about this request and must not be retried a second way.
      let payload: any;
      let shape = "images";
      try {
        const first: any = await send(
          "/images/generations",
          { model: parts.id, prompt, n, size },
          "images",
        );
        if (first.payload) {
          payload = first.payload;
        } else if (first.res.status === 404 || first.res.status === 405) {
          const second: any = await send(
            "/chat/completions",
            {
              model: parts.id,
              messages: [{ role: "user", content: prompt }],
              modalities: ["image", "text"],
            },
            "chat",
          );
          if (!second.payload) return fail(String(second.error?.message ?? second.error));
          payload = second.payload;
          shape = "chat";
        } else {
          return fail(String(first.error?.message ?? first.error));
        }
      } catch (err: any) {
        if (err?.name === "TimeoutError" || err?.name === "AbortError") {
          // An abort the user asked for is not a failure worth retrying.
          if (signal?.aborted) return fail("image generation was stopped");
          return fail(`${ref} timed out after ${TIMEOUT_MS / 1000}s`);
        }
        return fail(`${ref}: ${String(err?.message ?? err)}`);
      }

      const picked = pickImages(payload);
      if (!picked.length) return fail(`${ref} returned no image`);

      // [w, h] from the requested shape; the gateway rarely echoes it back.
      const [w, h] = size.split("x").map((v) => Number(v));
      const images: Array<{
        type: "image";
        sha256: string;
        mimeType: string;
        width?: number;
        height?: number;
      }> = [];
      for (const item of picked) {
        let bytes: Uint8Array;
        try {
          bytes = await toBytes(item, f, stop);
        } catch (err: any) {
          return fail(String(err?.message ?? err));
        }
        const mimeType = sniffMime(bytes);
        let saved: { sha256: string; size: number };
        try {
          saved = saveImage(deps.home, Buffer.from(bytes).toString("base64"), mimeType);
        } catch (err: any) {
          return fail(`could not store the generated image: ${String(err?.message ?? err)}`);
        }
        images.push({
          type: "image",
          sha256: saved.sha256,
          mimeType,
          ...(Number.isFinite(w) && Number.isFinite(h) ? { width: w, height: h } : {}),
        });
      }

      // The text is what the model reads: what came out, where the file is, and
      // the one thing it can do next.
      const lines = [
        images.length === 1
          ? `generated 1 image (${size}, ${images[0].mimeType}) with ${ref}`
          : `generated ${images.length} images (${size}) with ${ref}`,
      ];
      for (const img of images) {
        const file = `${img.sha256}.${img.mimeType.split("/")[1] ?? "bin"}`;
        lines.push(`- ${file} — served at /blobs/${img.sha256}`);
        lines.push(`  file: ${path.join(uploadsDir(deps.home), file)}`);
      }
      lines.push(
        "The user sees the picture already; do not describe it back as a link. " +
          "To look at it yourself, read the file path above.",
      );
      return ok(lines.join("\n"), { images, prompt, model: ref, size, shape });
    },
  });
}
