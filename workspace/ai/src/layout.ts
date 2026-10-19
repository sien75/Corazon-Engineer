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

// describeLayout is the tree as one line per pane, for the tool's result: the model
// gets the same picture the frontend will render, handles included, so a later call
// can name the pane it means to change. Old field names are printed too, for a
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

// ---------- incremental edits ----------
//
// The model does not write the tree any more: it says where a pane goes and reads
// back what that made. `nextTo` + `side` is enough to derive the structure, which
// is the point — a layout the model has to echo is a layout it can silently lose.

export type Side = "left" | "right" | "top" | "bottom";

// sideAxis is the split direction a side lives in: left/right sit side by side,
// top/bottom stack.
function sideAxis(side: Side): "row" | "column" {
  return side === "left" || side === "right" ? "row" : "column";
}

// The pane a node shows, or "" for a split.
function paneIdOf(node: PaneNode): string {
  const p = (node as PaneLeaf).pane as Record<string, any> | undefined;
  return p && typeof p.paneId === "string" ? p.paneId : "";
}

function flexOf(node: PaneNode): string | undefined {
  return (node as any)?.pane?.flex ?? (node as any)?.split?.flex;
}

function withFlex(node: PaneNode, flex: string | undefined): PaneNode {
  const copy = JSON.parse(JSON.stringify(node)) as PaneNode;
  if (!flex) return copy;
  if ("pane" in copy) copy.pane.flex = flex;
  else copy.split.flex = flex;
  return copy;
}

function withoutFlex(node: PaneNode): PaneNode {
  const copy = JSON.parse(JSON.stringify(node)) as PaneNode;
  if ("pane" in copy) delete copy.pane.flex;
  else delete copy.split.flex;
  return copy;
}

// addPane puts `leaf` beside the pane `nextTo`. When the side lives in the same
// direction as the parent split the pane simply joins its siblings; when it
// crosses them (bottom, inside a row) the anchor is lifted out and wrapped with
// the new pane in a fresh split of its own — so its share of the tab is kept.
export function addPane(
  tree: PaneNode,
  nextTo: string,
  side: Side,
  leaf: PaneLeaf,
): { tree: PaneNode; added: boolean } {
  const axis = sideAxis(side);
  const before = side === "left" || side === "top";

  const walk = (node: PaneNode): { tree: PaneNode; added: boolean } => {
    if ("pane" in node) {
      // The anchor is the whole tab: the new split becomes the tree, and the
      // pane keeps its (single) share of it.
      if (paneIdOf(node) !== nextTo) return { tree: node, added: false };
      const share = flexOf(node);
      const out: PaneNode = {
        split: {
          flexDirection: axis,
          ...(share ? { flex: share } : {}),
          children: before
            ? [withoutFlex(leaf), withoutFlex(node)]
            : [withoutFlex(node), withoutFlex(leaf)],
        },
      };
      return { tree: out, added: true };
    }
    const children = node.split.children.map((c) => c);
    const at = children.findIndex((c) => paneIdOf(c) === nextTo);
    if (at >= 0 && node.split.flexDirection === axis) {
      const placed = before
        ? [...children.slice(0, at), leaf, ...children.slice(at)]
        : [...children.slice(0, at + 1), leaf, ...children.slice(at + 1)];
      const out: PaneNode = {
        split: { ...node.split, children: placed },
      };
      return { tree: out, added: true };
    }
    if (at >= 0) {
      const anchor = children[at];
      const share = flexOf(anchor) ?? "1 1 0";
      const wrapped: PaneNode = {
        split: {
          flexDirection: axis,
          flex: share,
          children: before
            ? [withoutFlex(leaf), withoutFlex(anchor)]
            : [withoutFlex(anchor), withoutFlex(leaf)],
        },
      };
      const placed = [...children.slice(0, at), wrapped, ...children.slice(at + 1)];
      const out: PaneNode = { split: { ...node.split, children: placed } };
      return { tree: out, added: true };
    }
    for (let i = 0; i < children.length; i++) {
      const res = walk(children[i]);
      if (res.added) {
        const placed = [...children.slice(0, i), res.tree, ...children.slice(i + 1)];
        return { tree: { split: { ...node.split, children: placed } }, added: true };
      }
    }
    return { tree: node, added: false };
  };

  return walk(tree);
}

// deletePane removes one pane. A split left with a single child collapses into
// that child — an empty container is not a layout, it is a residue.
export function deletePane(
  tree: PaneNode,
  paneId: string,
): { tree: PaneNode; deleted: boolean } {
  const walk = (node: PaneNode): { tree: PaneNode; deleted: boolean } => {
    // Deleting the tab's only pane is reported as deleted; the caller refuses it
    // on the pane count, which is where "a tab keeps one pane" belongs.
    if ("pane" in node) return { tree: node, deleted: paneIdOf(node) === paneId };
    const children = node.split.children;
    const at = children.findIndex((c) => paneIdOf(c) === paneId);
    if (at >= 0) {
      const left = [...children.slice(0, at), ...children.slice(at + 1)];
      return { tree: collapse(node, left), deleted: true };
    }
    for (let i = 0; i < children.length; i++) {
      const res = walk(children[i]);
      if (res.deleted) {
        const placed = [...children.slice(0, i), res.tree, ...children.slice(i + 1)];
        return { tree: collapse(node, placed), deleted: true };
      }
    }
    return { tree: node, deleted: false };
  };

  const collapse = (node: PaneNode, children: PaneNode[]): PaneNode => {
    if (children.length === 1) {
      const only = withoutFlex(children[0]);
      return withFlex(only, flexOf(node)) as PaneNode;
    }
    return { split: { ...(node as PaneSplit).split, children } };
  };

  return walk(tree);
}

export function paneCount(node: PaneNode): number {
  if ("pane" in node) return 1;
  return node.split.children.reduce((n, c) => n + paneCount(c), 0);
}

export function paneIds(node: PaneNode, out: string[] = []): string[] {
  if ("pane" in node) {
    const id = paneIdOf(node);
    if (id) out.push(id);
    return out;
  }
  for (const c of node.split.children) paneIds(c, out);
  return out;
}

export function contentIds(node: PaneNode, out: string[] = []): string[] {
  if ("pane" in node) {
    const id = (node.pane as Record<string, any>).contentId;
    if (id) out.push(String(id));
    return out;
  }
  for (const c of node.split.children) contentIds(c, out);
  return out;
}
