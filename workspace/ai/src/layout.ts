import { randomBytes } from "node:crypto";
import YAML from "yaml";

// The tab's pane tree: the one piece of state the model owns through a tool.
//
// It is stored by log as opaque text (log never reads it), so the shape is
// defined here and shown to the model in the tool's description. Two node
// shapes, recursive:
//
//   leaf:  { pane: { paneId, contentId, flex? } }        (or blueprint: … for a new agent)
//   split: { split: { flexDirection: "row" | "column", flex?, children: [ … ] } }
//
// A leaf keeps three things apart, and keeping them apart is the point:
//
//   paneId       which pane this is — a handle this tool issues, never invented
//   contentId    which agent the pane shows (a session id), or `blueprint: <slug>`
//                to instantiate a new one; every pane shows an agent, and an
//                agent's UI is its blueprint's index.html
//   flex         the CSS shorthand for the share this node takes from its parent
//
// Because a pane's identity is a field of its own, the same content may appear in
// two panes and still be two panes — and a pane that only *moves* is the same pane,
// so the frontend keeps its DOM, its draft, its scroll and its share of the stream.
// Position in the tree is not identity.
//
// `flex` is CSS's `flex` shorthand, validated to a narrow subset: a share is a
// small integer, and the ratio form ("2 1 0") is what a layout should use. A leaf
// with no flex shares evenly — the frontend's default, not CSS's `0 1 auto`, which
// would collapse a chat pane to the width of its content.
export interface PaneLeaf {
  pane: {
    paneId: string;
    contentId: string;
    flex?: string;
  };
}

export interface PaneSplit {
  split: { flexDirection: "row" | "column"; flex?: string; children: PaneNode[] };
}

export type PaneNode = PaneLeaf | PaneSplit;

// Ceilings the tool will not go past. They exist so the model cannot produce a
// layout that is unreadable rather than merely unusual.
export const MAX_PANES = 6;

export interface NormalizeOptions {
  // Called for a leaf that names no agent but asks for a blueprint: the caller
  // instantiates one and its session id is written back into the tree, so the
  // frontend gets a pane it can open.
  newSession?: (blueprint: string) => Promise<string>;
  // Tells a handle the tool issued from one the model made up.
  hasSession?: (id: string) => Promise<boolean>;
  // The chat ids, and the pane ids, in the tab's current tree. Used to say what
  // *is* valid when a handle is rejected.
  currentIds?: string[];
  currentPaneIds?: string[];
}

export class LayoutError extends Error {}

// newPaneId issues a pane handle. Random, like a session id, so two tabs cannot
// collide on one value.
function newPaneId(): string {
  return `p_${randomBytes(4).toString("hex")}`;
}

// The flex shorthand, narrowed. The numbers are small on purpose: a layout that
// says 47 and 39 is not one anybody reads as a proportion.
const FLEX_RE = /^([0-3])(?:\s+([01]))?(?:\s+(0|auto|\d{1,4}px))?$/;

// checkFlex accepts the ratio form a layout should use, and the fixed basis it may
// sometimes need; everything else CSS allows is refused with the reason.
function checkFlex(value: unknown, where: string): string {
  const s = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const m = s ? FLEX_RE.exec(s) : null;
  if (!m) {
    throw new LayoutError(
      `${where}: cannot read flex ${JSON.stringify(value)}. Write it the way CSS does, ` +
        `"<grow> [<shrink>] [<basis>]" — grow 0..3, shrink 0 or 1, basis 0, auto or <n>px. ` +
        `Reach for the ratio form ("2 1 0"); leave flex out to share the space evenly.`,
    );
  }
  return m[0];
}

// normalizeLayout checks a tree and returns a copy with pane handles filled in and
// flex validated, so what the model wrote and what log stores never drift. A leaf
// that arrives without a paneId is a new pane and is issued one; a leaf that passes
// an unknown one is a mistake worth reporting, because quietly handing it a fresh
// handle would rebuild a pane the model meant to keep.
export async function normalizeLayout(
  raw: unknown,
  opts: NormalizeOptions = {},
): Promise<PaneNode> {
  let panes = 0;
  const usedPaneIds = new Set<string>();

  const walk = async (node: unknown, depth: number): Promise<PaneNode> => {
    if (!node || typeof node !== "object") {
      throw new LayoutError("each node must be an object");
    }
    const n = node as Record<string, any>;
    if (typeof n.split === "string") {
      throw new LayoutError(
        `a split carries its direction as CSS does: ` +
          `{ split: { flexDirection: "${n.split === "col" ? "column" : "row"}", children: [ … ] } }`,
      );
    }
    if (n.pane !== undefined) {
      return await leaf(n.pane);
    }
    if (n.split === undefined) {
      throw new LayoutError('each node is either { pane: … } or { split: … }');
    }
    const s = n.split;
    if (!s || typeof s !== "object") {
      throw new LayoutError("a split must be an object: { split: { … } }");
    }
    if (s.flexDirection !== "row" && s.flexDirection !== "column") {
      throw new LayoutError(
        'a split needs flexDirection: "row" (left/right) or "column" (top/bottom)',
      );
    }
    if (!Array.isArray(s.children) || !s.children.length) {
      throw new LayoutError("a split needs at least one child");
    }
    const children: PaneNode[] = [];
    for (const c of s.children) children.push(await walk(c, depth + 1));
    const out: PaneSplit = { split: { flexDirection: s.flexDirection, children } };
    if (s.flex !== undefined) out.split.flex = checkFlex(s.flex, "a split");
    return out;
  };

  const leaf = async (rawLeaf: any): Promise<PaneLeaf> => {
    if (!rawLeaf || typeof rawLeaf !== "object") {
      throw new LayoutError("a pane must be an object");
    }
    if (rawLeaf.content !== undefined || rawLeaf.id !== undefined) {
      throw new LayoutError(
        "a pane takes contentId, not content or id: " +
          "{ pane: { paneId, contentId, flex? } } — or blueprint: <slug> for a new agent",
      );
    }
    let paneId = typeof rawLeaf.paneId === "string" ? rawLeaf.paneId.trim() : "";
    if (paneId && usedPaneIds.has(paneId)) {
      throw new LayoutError(
        `paneId ${paneId} is on two panes — each pane needs its own; leave the id ` +
          `out for a pane that is new`,
      );
    }
    if (paneId && opts.currentPaneIds && !opts.currentPaneIds.includes(paneId)) {
      const valid = opts.currentPaneIds.length
        ? `This tab's panes: ${opts.currentPaneIds.join(", ")}.`
        : "This tab has no panes yet.";
      throw new LayoutError(
        `no pane ${paneId} in this tab — a paneId must be one this tool returned. ${valid} ` +
          `Leave the id out to open a new pane.`,
      );
    }
    if (!paneId) paneId = newPaneId();
    usedPaneIds.add(paneId);

    // Every pane shows one agent: a handle this tool issued (contentId), or a
    // blueprint this call instantiates into a new agent. There is no other kind
    // of pane — an agent always has UI, because it is always made from a
    // blueprint.
    const contentId = typeof rawLeaf.contentId === "string" ? rawLeaf.contentId.trim() : "";
    const blueprint = typeof rawLeaf.blueprint === "string" ? rawLeaf.blueprint.trim() : "";
    if (contentId && blueprint) {
      throw new LayoutError("a pane takes contentId or blueprint, not both");
    }
    let resolved = contentId;
    if (!resolved) {
      if (!blueprint) {
        throw new LayoutError(
          "a pane needs contentId (an agent already in this tab) or blueprint: <slug> (a new agent)",
        );
      }
      if (!opts.newSession) {
        throw new LayoutError("instantiating a blueprint is not available here");
      }
      resolved = await opts.newSession(blueprint);
    } else if (opts.hasSession && !(await opts.hasSession(resolved))) {
      // A contentId is a handle this tool issued, not something the model knows:
      // an id that resolves to nothing is a mistake worth reporting — silently
      // showing a different agent would lose the one it meant to keep.
      const valid = opts.currentIds?.length
        ? `This tab's panes: ${opts.currentIds.join(", ")}.`
        : "This tab has no agent panes yet.";
      throw new LayoutError(
        `no agent ${resolved} — a contentId must be one this tool returned. ${valid} ` +
          `Use blueprint: <slug> to instantiate a new agent.`,
      );
    }

    panes++;
    if (panes > MAX_PANES) throw new LayoutError(`at most ${MAX_PANES} panes`);
    const pane: PaneLeaf["pane"] = { paneId, contentId: resolved };
    if (rawLeaf.flex !== undefined) pane.flex = checkFlex(rawLeaf.flex, `pane ${paneId}`);
    return { pane };
  };

  const tree = await walk(raw, 0);
  // The root has no parent to take a share from.
  if ("split" in tree && tree.split.flex) {
    throw new LayoutError("the tree's root split has no parent to share with: drop its flex");
  }
  return tree;
}

// describeLayout is the tree as one line per pane, for the tool's result: the model
// gets the same picture the frontend will render, handles included, so a later
// write can name the panes it means to keep. Old field names are printed too, for a
// record written before this shape existed.
export function describeLayout(node: PaneNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  if ("pane" in node) {
    const p = node.pane as Record<string, any>;
    const paneId = p.paneId || "(none — a new pane)";
    const contentId = p.contentId ?? p.id ?? p.content ?? "";
    const flex = p.flex ? ` flex="${p.flex}"` : "";
    return `${pad}- pane ${paneId} agent ${contentId}${flex}`;
  }
  const s = node.split as Record<string, any>;
  const dir = s.flexDirection || (s.direction === "column" ? "column" : "row");
  const flex = s.flex ? ` flex="${s.flex}"` : "";
  return [
    `${pad}- split ${dir}${flex}`,
    ...s.children.map((c: PaneNode) => describeLayout(c, depth + 1)),
  ].join("\n");
}

// readLayout fetches a tab's stored tree, or undefined when the tab has none —
// including the empty record log-tab-new creates, which is a tab that exists but
// does not hold anything yet.
export async function readLayout(
  logBase: string,
  tabId: string,
): Promise<{ tabId: string; layout: PaneNode } | undefined> {
  const res = await fetch(`${logBase}/log/tab/detail`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: YAML.stringify({ tabId }),
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`log/tab/detail: HTTP ${res.status}`);
  const data: any = YAML.parse(await res.text());
  if (!data?.layout || Object.keys(data.layout).length === 0) return undefined;
  return { tabId: data.tabId ?? tabId, layout: data.layout as PaneNode };
}

// writeLayout stores a tab's tree. No tabId allocates one, which is how a tab
// gets its record when the frontend opens one.
export async function writeLayout(
  logBase: string,
  tabId: string,
  layout: PaneNode,
): Promise<{ tabId: string; layout: PaneNode }> {
  const res = await fetch(`${logBase}/log/tab/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: YAML.stringify(tabId ? { tabId, layout } : { layout }),
  });
  if (!res.ok) throw new Error(`log/tab/mutation: HTTP ${res.status}`);
  const data: any = YAML.parse(await res.text());
  return { tabId: data.tabId, layout: (data.layout ?? layout) as PaneNode };
}
