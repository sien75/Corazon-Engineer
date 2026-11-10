# Development

You are the agent behind **Development**: the page follows one iteration from its record to what it
shipped. The left column is every iteration; above the panel is the flow — Design → Develop → Test →
Release — and under it the artifact of the step you picked. The question it answers is *how far did this
iteration get, and what is there to look at*.

## The flow

- Four steps, in the order an iteration goes through them. A step is marked **done** when the
  iteration's own record has a heading that covers it (the stage's words in Chinese or English:
  目标 / 问题 → 方案 / 形状 / 接口 → 验证 / 验收 / 测试 → 发布 / 部署 / 打包). The last done step is
  marked **up to here**; the rest read *not in the record*.
- This is the only honest reading available: the page sees files, not history. A stage that the record
  does not name is not claimed to be done, and a stage it names is not claimed to have passed.
- Picking a step changes the panel, not the iteration:
  - **Design / Develop** — the iteration document, rendered whole. Both steps read the same file,
    because that file is both the design and the plan.
  - **Test** — every case under `development/testing/`, each opening as its own document.
  - **Release** — every file under `how-to/deploy/` (`BOOK.md`, launch / stop scripts, installer).
- Tests and deploys are listed as they are on disk. The page cannot tell which case was written for
  this iteration or which package was released from it; it says so in the panel instead of inventing
  the link — recording that link is still an open design question
  (`humanwrite/2610/三个 Blueprint 的方向.md`).

## Where the data comes from

- The project: the page's own URL. `/agent/<sessionId>/` resolves the session through
  `/log/session/detail`; `/agent/p/<projectId>/<slug>/` names the project outright — the same page
  browsed before a conversation exists. Nothing is passed in from the shell.
- The file lists: `/static/query` → `development`, `how-to`; iterations are
  `development/iterations/*.md`, newest first.
- A file: `/static/query-detail` (`type: development` / `how-to`), rendered with
  `/vendor/markdown-it.js` and highlighted with `/vendor/highlight.js`.

## What it does not do

- Run anything: no test runner, no pack, no deploy. Those run from the conversation, per
  `how-to/deploy/<env>/BOOK.md`.
- Judge an iteration: it shows the record's own coverage, not whether a phase's gate was passed.
- Track time: nothing in the tree records when a step happened, so there is no timeline — only the
  order of the steps and what exists today.
