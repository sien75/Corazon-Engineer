# Writing the How-to Content

How to write and maintain a project's how-to material — `how-to/` plus the project's SOP (`AGENTS.md`) — together with the user. This file is the detailed companion to Type 3 in `./AGENTS.md`: the steps below are the **complete initialization path**, in order.

A fresh project walks all five steps; later work usually needs only one of them, so read that step rather than the whole file. Initialization is just the first pass — when reality drifts from the how-to, the same steps are how it is brought back in step.

Every step has the same three parts: **Do** — what you work out; **Ask** — what only the user can tell you; **Write** — what lands in the repo.

---

## Step 1 — Map the system

**Do**

- Work out the system's main parts and how they roughly relate.
- Keep it coarse at first; completeness is not the goal.

**Ask**

- What are the system's main parts?
- How do they connect?
- Which databases, caches, message queues or external services does it use?

**Write**

- `engineer.yaml`
- `atoms/`
- `edges/`

---

## Step 2 — Attach the real code

**Do**

- Find the real code behind each atom.
- Read its structure, then add or correct atoms and edges.

**Ask**

- Where does each atom's code live?
- This directory, a subdirectory, or another repository?
- Only ask what you cannot tell yourself.

**Write**

- `workspace/`
- add / correct `atoms/`
- add / correct `edges/`

---

## Step 3 — Analyze the contracts

**Do**

- Derive the system's interfaces and data shapes from the real implementation.
- Prefer API definitions, controllers, RPC, message structures, database schemas.

**Ask**

- Ask the user only what the code and the existing material cannot settle.
- Never ask the user to hand-describe every interface.

**Write**

- `contracts/`
- the related `atoms/` / `edges/` when they have to follow

---

## Step 4 — Establish how the system is built and run

**Do**

- Pin down how the project is developed, built, started and deployed.

**Ask**

- How do you start it locally?
- Are there special build or packing steps?
- How is it deployed per environment?

**Write**

- `how-to/deploy/[env]/BOOK.md` — one cookbook per environment
- `how-to/README.md`

---

## Step 5 — Establish verification and operation

**Do**

- Pin down how the system is verified, and how the real running environment is reached.

**Ask**

- How does the user actually use and verify this system?
- How do you connect to its databases, caches, logs, service instances?
- Which environments need support today?

**Write**

- `development/testing/` — E2E tests, from the user's point of view
- `how-to/operation/`

---

## Principles

- Map the system first, then attach the code, then go deep on interfaces and operation.
- Initialization does not have to finish in one pass.
- The user may describe things coarsely; prefer whatever you can analyze from the code and the running system.
- Do not stop after creating empty directories: at minimum leave initial atoms, edges and workspace links in place.
- As new structure, interfaces or operational knowledge turns up, keep extending and correcting what is already written.
