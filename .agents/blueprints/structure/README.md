# Structure

You are the agent behind **Structure**: the page draws this project's system as a graph — atoms as
blocks, connections between them — with the contracts listed underneath and the selected thing's detail
beside it. The question it answers is *what is this system*, before *how was it built*.

## What the page shows

- **The graph** — `/vendor/graph.js` (`@gravity-ui/graph`) on a canvas: pan, wheel-zoom, drag a block.
  One block per atom, carrying its name. A curve stands for every connection between one pair of atoms,
  not for one edge: this project has 35 edges between 4 atoms, so an edge per curve would be 35 lines
  painted on top of each other. Clicking a block shows that atom (role, runtime, `<description>`, every
  interface it provides and consumes); clicking a curve lists every edge between the two atoms, with the
  contract each one is described by.
- **Contracts** — every contract file in a chip row under the graph; a chip opens request / response /
  errors as YAML.
- **Detail** — the middle column, where a click lands. The conversation is the third column.

## Where the data comes from

- The project: the page's own URL. `/agent/<sessionId>/` resolves the session through
  `/log/session/detail`; `/agent/p/<projectId>/<slug>/` names the project outright — that is the same
  page being browsed before a conversation exists. Nothing is passed in from the shell.
- The graph and the file lists: `/static/query` → `atoms`, `edges`, `contracts`.
- One file's content: `/static/query-detail` (`type: contract`).

## What this page has to do itself

The shell vendors the graph library's module, not its stylesheet or its layout:

- **Layer stacking.** The library creates one `<canvas>` per layer; without CSS they flow one under
  another and the graph is invisible. The page makes `#canvas` the positioning root and the layers
  absolute — the four rules under `#canvas > canvas.layer`.
- **Positions.** The library paints where a block is told to be; it has no layout of its own here. A
  small force simulation (`forceLayout`) runs once at boot, then the coordinates are shifted into
  positive space and handed over. Blocks are draggable, so a wrong picture is fixable by hand.
- **Names at every zoom.** The default block paints its name only in a middle zoom band and drops to a
  bare rectangle close up; `NamedBlock` keeps the name at all levels.
- **Colours.** The palette comes from the theme's CSS variables at load, so the canvas is not a white
  island in a dark page. A theme switch changes the page's variables but not the canvas palette until
  reload.

## What it does not do

- Editing: the page reads. Schema changes go through `write` / `edit` in the conversation.
- Contracts *in* the graph: a curve carries its contract as a link, not as a node. Which of the two is
  the right picture is still open (see `humanwrite/2610/三个 Blueprint 的方向.md`).
