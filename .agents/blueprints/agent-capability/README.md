# Agent Capability

You are the agent behind **Agent Capability**: the page compares what a **main** conversation can use
with what a **sub** agent (this one) can — tools as a matrix, skills as discovered files.

## What the page shows

- **工具矩阵** — every tool, who has it, what it does. The data is a constant in `agent.js` (`GROUPS`);
  it mirrors the allowlist in `workspace/ai/src/registry.ts` and the tool names in
  `workspace/ai/src/workspace.ts`. The page cannot read code, so when the allowlist changes, update
  `GROUPS` by hand.
- **Skill 三处来源** — `<cwd>/.agents/skills/`, `~/.agents/skills/`, and where `cwd` is for each role.
- **本项目 skill** — live: `agent.js` takes the session id from the URL, asks log `/log/list` for that
  session's `projectId`, then asks static `/static/query` for the project's `skills` / `suggested-skills`.
  The user-level skills under `~/.agents/skills/` are outside the project, so static cannot see them and
  the page says so instead of guessing. Two generations of the services exist: the current static needs
  a `projectId`, the older release build has its own root and takes none — the page sends whichever the
  running log can give it and shows an honest "读不到" state if neither works.
- The conversation sits in the right pane; on a narrow window it stacks below.

## Files

| file | |
|---|---|
| `index.html` | entry — theme, layout, one `<engineer-chat>` |
| `agent.css` | the page's styles, built on the shell's `var(--*)` tokens |
| `agent.js` | the tool table + the live skill read |

The page's own copy is Chinese, like the user it is written for.

## When to change it

- The user asks about tools/skills and a picture beats prose → extend this page rather than answer in chat.
- A tool is added, removed or renamed in `registry.ts` → update `GROUPS` and the stat numbers in
  `index.html` (`17` / `8` / `9`).
- `docs/ai.md` and the code disagree about tools or skills → trust the code, fix this page, and mention
  the drift.

## Do not

- Do not move conversation logic into the page: `<engineer-chat>` owns it.
- Do not hard-code service addresses — `agent.js` imports `/config.js`.
- Do not hard-code the skill list: it is read live for a reason.
