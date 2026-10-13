import YAML from "yaml";

// The tab's pane tree: the one piece of state the model owns through a tool.
//
// It is stored by log as opaque text (log never reads it), so the shape is
// defined here and shown to the model in the tool's description. Two node
// shapes, recursive:
//
//   leaf:  { pane: { content: "chat" | "page", id: string, size?: "fill" | "brief" } }
//   split: { split: "col" | "row", weight?: 1 | 2 | 3, children: [ <node>, ... ] }
//
// `col` splits left/right, `row` splits top/bottom; `weight` is the relative
// share within one split; `size: brief` marks a short pane and is only valid on
// a leaf. A pane's id is its content id — a chat's sessionId, a page's blueprint
// slug — so the same content may appear in two panes.

export interface PaneLeaf {
  pane: { content: "chat" | "page"; id: string; size?: "fill" | "brief" };
}

export interface PaneSplit {
  split: "col" | "row";
  weight?: number;
  children: PaneNode[];
}

export type PaneNode = PaneLeaf | PaneSplit;

// Ceilings the tool will not go past. They exist so the model cannot produce a
// layout that is unreadable rather than merely unusual.
export const MAX_PANES = 6;

export interface NormalizeOptions {
  // Called for a chat pane that names no session: the caller creates one and
  // its id is written back into the tree, so the frontend gets a pane it can
  // actually open.
  newSession?: () => Promise<string>;
  // Tells a handle the tool issued from one the model made up.
  hasSession?: (id: string) => Promise<boolean>;
  // The chat ids in the tab's current tree. Only used to say what *is* valid
  // when an id is rejected.
  currentIds?: string[];
}

export class LayoutError extends Error {}

// normalizeLayout checks a tree and returns a copy with the weights and sizes
// filled in, so what the model wrote and what log stores never drift. Session
// ids for new chat panes are allocated as it walks.
export async function normalizeLayout(
  raw: unknown,
  opts: NormalizeOptions = {},
): Promise<PaneNode> {
  let panes = 0;
  const walk = async (node: unknown, depth: number): Promise<PaneNode> => {
    if (!node || typeof node !== "object") {
      throw new LayoutError("each node must be an object");
    }
    const n = node as Record<string, any>;
    if (n.pane !== undefined) {
      return await leaf(n.pane);
    }
    if (n.split !== "col" && n.split !== "row") {
      throw new LayoutError('a split needs split: "col" or "row"');
    }
    if (!Array.isArray(n.children) || !n.children.length) {
      throw new LayoutError("a split needs at least one child");
    }
    const children: PaneNode[] = [];
    for (const c of n.children) children.push(await walk(c, depth + 1));
    const out: PaneSplit = { split: n.split, children };
    if (n.weight !== undefined) {
      const w = Number(n.weight);
      if (!Number.isInteger(w) || w < 1 || w > 3) {
        throw new LayoutError("weight must be 1, 2 or 3");
      }
      out.weight = w;
    }
    return out;
  };

  const leaf = async (raw: any): Promise<PaneLeaf> => {
    if (!raw || typeof raw !== "object") {
      throw new LayoutError("a pane must be an object");
    }
    if (raw.content !== "chat" && raw.content !== "page") {
      throw new LayoutError('a pane needs content: "chat" or "page"');
    }
    if (raw.size !== undefined && raw.size !== "fill" && raw.size !== "brief") {
      throw new LayoutError('size must be "fill" or "brief"');
    }
    let id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (raw.content === "chat") {
      // A chat pane's id is a handle this tool issued, not something the model
      // knows: it either leaves it out (a new conversation) or passes back an id
      // a previous read or write returned. An id that resolves to nothing is a
      // mistake worth reporting — silently opening a *different* conversation in
      // its place would lose the one the model was trying to keep.
      if (id && opts.hasSession && !(await opts.hasSession(id))) {
        const valid = opts.currentIds?.length
          ? `This tab's panes: ${opts.currentIds.join(", ")}.`
          : "This tab has no conversation panes yet.";
        throw new LayoutError(
          `no conversation ${id} — a chat pane's id must be one this tool returned. ` +
            `${valid} Leave the id out to open a new one.`,
        );
      }
      if (!id) {
        if (!opts.newSession) throw new LayoutError("a chat pane needs an id");
        id = await opts.newSession();
      }
    }
    if (!id) throw new LayoutError("a page pane needs the blueprint's id");
    panes++;
    if (panes > MAX_PANES) {
      throw new LayoutError(`at most ${MAX_PANES} panes`);
    }
    const pane: PaneLeaf["pane"] = { content: raw.content, id };
    if (raw.size === "brief") pane.size = "brief";
    return { pane };
  };

  const tree = await walk(raw, 0);
  assertBriefIsLeaf(tree);
  return tree;
}

// brief pins a pane to the short band at the bottom of its split, which only
// makes sense for a pane that has a split to sit under.
function assertBriefIsLeaf(node: PaneNode): void {
  if ("pane" in node) return;
  for (const c of node.children) {
    if ("pane" in c && c.pane.size === "brief" && node.split !== "row") {
      throw new LayoutError("a brief pane must sit in a row split (it is a short band)");
    }
    assertBriefIsLeaf(c);
  }
}

// describeLayout is the tree as one line per pane, for the tool's result: the
// model gets the same picture the frontend will render.
export function describeLayout(node: PaneNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  if ("pane" in node) {
    const { content, id, size } = node.pane;
    return `${pad}- ${content} ${id}${size === "brief" ? " (brief)" : ""}`;
  }
  const w = node.weight ? ` weight=${node.weight}` : "";
  return [
    `${pad}- split ${node.split}${w}`,
    ...node.children.map((c) => describeLayout(c, depth + 1)),
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
