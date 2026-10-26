// Agent Capability — the matrix is the page, the numbers are read from the
// project's files. Tools come from Corazon Engineer's own allowlist; skills are
// whatever the project currently has under `.agents/skills/` (read through
// static), so a skill added today shows up on reload.

import yaml from "/vendor/js-yaml.js";
import { ENGINEER } from "/config.js";

const { static: STATIC, log: LOG } = ENGINEER;
const YAML = { "Content-Type": "application/yaml" };

// ---------------------------------------------------------------- tools

// One row per tool. `main` / `sub` say who has it. Keep in sync with
// workspace/ai/src/registry.ts (the allowlist) — the page cannot read code.
const GROUPS = [
  {
    title: "pi 内建 —— 两个角色都有",
    rows: [
      ["read", "读文件（文本 / 图片）", 1, 1],
      ["grep", "按正则搜索文件内容", 1, 1],
      ["find", "按 glob 找文件", 1, 1],
      ["ls", "列目录", 1, 1],
      ["bash", "执行命令：curl 联网、跑外部 CLI、装工具", 1, 1],
      ["write", "新建或覆盖文件", 1, 1],
      ["edit", "精确替换文件片段", 1, 1],
    ],
  },
  {
    title: "自定义工具 —— 两个角色都有",
    rows: [
      ["ask_user", "向用户提问并结束本轮；回答作为下一条用户消息", 1, 1],
    ],
  },
  {
    title: "工作区工具 —— 只有 main",
    rows: [
      ["project-list", "项目板：每个项目的 projectId、名字、路径", 1, 0],
      ["session-list", "当前打开的会话（一个会话就是一个 tab）", 1, 0],
      ["session-open", "把已有会话放回屏幕，可指定顺序", 1, 0],
      ["session-close", "从屏幕上收起；会话记录都还在", 1, 0],
      ["session-new", "从某个项目的 blueprint 建一个新 agent 并开 tab", 1, 0],
      ["session-delete", "永久删掉一个会话及其记录，不可逆", 1, 0],
      ["main-list", "main 自己的历史会话（消息数、最近活动）", 1, 0],
      ["main-new", "换一个新的 main 会话，旧的记录保留", 1, 0],
      ["main-resume", "按 id 回到某个历史 main 会话", 1, 0],
    ],
  },
];

const tbody = document.getElementById("tool-rows");

for (const group of GROUPS) {
  const gtr = document.createElement("tr");
  gtr.className = "group";
  const gtd = document.createElement("td");
  gtd.colSpan = 4;
  gtd.textContent = group.title;
  gtr.append(gtd);
  tbody.append(gtr);

  for (const [name, what, main, sub] of group.rows) {
    const tr = document.createElement("tr");
    tr.dataset.only = main && sub ? "both" : "main";

    const nameCell = document.createElement("td");
    nameCell.className = "name";
    nameCell.textContent = name;

    const whatCell = document.createElement("td");
    whatCell.className = "what";
    whatCell.textContent = what;

    tr.append(nameCell, whatCell, mark(main), mark(sub));
    tbody.append(tr);
  }
}

function mark(has) {
  const td = document.createElement("td");
  td.className = "mark";
  if (has) {
    td.classList.add("yes");
    td.textContent = "✓";
    td.setAttribute("aria-label", "有");
  } else {
    td.classList.add("no");
    td.textContent = "—";
    td.setAttribute("aria-label", "没有");
  }
  return td;
}

const table = document.getElementById("tools");
document.getElementById("filter").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-filter]");
  if (!btn) return;
  table.dataset.filter = btn.dataset.filter;
  for (const b of ev.currentTarget.querySelectorAll("button")) {
    b.classList.toggle("on", b === btn);
  }
});

// ---------------------------------------------------------------- skills

const liveTag = document.getElementById("live-tag");
const liveBody = document.getElementById("live-body");
const liveNote = document.getElementById("live-note");
const skillCount = document.getElementById("skill-count");

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: YAML, body });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return yaml.load(await res.text()) ?? {};
}

function sessionIdFromPath() {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[0] === "agent" ? decodeURIComponent(parts[1] ?? "") : "";
}

// A skill path is `.agents/skills/<slug>/SKILL.md`; the slug is what the agent
// sees in its prompt, so that is what the page shows.
function slugOf(path) {
  const parts = String(path).split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : String(path);
}

function chip(text, suggested) {
  const el = document.createElement("span");
  el.className = suggested ? "chip suggested" : "chip";
  el.textContent = text;
  return el;
}

async function loadSkills() {
  const sessionId = sessionIdFromPath();
  if (!sessionId) throw new Error("URL 里没有 sessionId");

  const list = await post(`${LOG}/log/list`, "pageNum: 1\n");
  const me = (list.sessions ?? []).find((s) => s.sessionId === sessionId);
  if (!me) throw new Error("log 里找不到这个会话");

  if (me.kind === "main") {
    // main belongs to no project, so there is no project tree to list.
    liveTag.textContent = "main";
    liveBody.innerHTML = '<span class="empty">main 不属于任何项目，没有项目级 skill。</span>';
    liveNote.textContent = "它只看得见用户级 skill（~/.agents/skills），那些在项目之外，这个页面读不到。";
    skillCount.textContent = "0";
    return;
  }

  // Two generations of static exist: the current one resolves a projectId
  // (log always has it), the older release build has a root of its own and
  // takes no projectId. Ask the way the running log allows, and let static
  // reject what it cannot do.
  const body = me.projectId ? `projectId: ${me.projectId}\n` : "{}\n";
  const tree = await post(`${STATIC}/static/query`, body);
  const skills = (tree.skills ?? []).map(slugOf).filter(Boolean);
  const suggested = (tree["suggested-skills"] ?? []).map((p) =>
    String(p).split("/").pop().replace(/\.md$/, ""),
  );

  liveBody.replaceChildren();
  if (!skills.length) {
    liveBody.innerHTML = '<span class="empty">这个项目还没有 .agents/skills/。</span>';
  }
  for (const slug of skills) liveBody.append(chip(slug, false));
  for (const slug of suggested) liveBody.append(chip(slug, true));

  liveTag.textContent = `${skills.length} 个项目级`;
  liveTag.classList.add("ok");
  skillCount.textContent = String(skills.length);

  liveNote.textContent =
    "列表由 static 读出本项目的 .agents/skills/ 后实时渲染；加上用户级 skill（~/.agents/skills，项目之外，" +
    "这个页面看不到）才是 agent 系统提示里那一整份。虚线框的是 .engineer/suggested-skills/ 里的候选，不会自动加载。";
}

loadSkills().catch((err) => {
  liveTag.textContent = "读不到";
  liveTag.classList.add("err");
  liveBody.innerHTML = "";
  const p = document.createElement("span");
  p.className = "empty";
  p.textContent = String(err.message ?? err);
  liveBody.append(p);
  liveNote.textContent =
    "这个页面通过 log 的 /log/list 找到自己的项目，再用 static 的 /static/query 读 .agents/skills/；" +
    "上面这条是失败的那一步。工具矩阵不受影响——它是页面自带的。";
  skillCount.textContent = "—";
});
