// The tab's name, summarized from the conversation itself.
//
// A session starts out named after its blueprint page's <title> — true of every
// agent made from that page, and therefore useless once a project has two of
// them. On the first user turn the shell asks the session's own model for a title
// instead, from what was actually said. It is written once: later turns do not
// rename the conversation.
//
// The material is the conversation's *prose only*: the user's prompts and the
// assistant's answers. Tool calls, tool results and thinking are left out — they
// are the machinery, not the subject — and so is every other record (compaction
// summaries, model switches). The call itself is out of band: it starts no run,
// appends nothing to the conversation, emits no event. It is not a turn; it is a
// name.

import type { StoredRecord } from "./recorder.ts";

// How much prose the title call is given, head and tail of the window (which is
// the first turn). A single answer can be enormous; a title never needs all of it.
const MATERIAL_BUDGET = 6000;
const MATERIAL_HEAD = 2500;

// A title is read on a tab, at a glance: it has to stay short. The two languages
// count differently — Chinese in characters, English in words — so the backstop
// has one budget per language and either one ends the title.
const MAX_CJK = 10;
const MAX_WORDS = 4;

// The scripts that count as "Chinese" here: Han, plus the kana a title may carry.
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

// The subject a title must not have: who did it is the user, always, so saying so
// is noise at best and a wrong point of view at worst.
const SUBJECT_PREFIX = /^(助手|用户|我|AI|ai|Ai|模型|assistant|Assistant|user|User)\s*(正在|在|的)?\s*/;

// The title is read on a tab, from the user's side of the screen: it says what the
// user was doing — an action, no subject. "助手总结工具" is the same conversation
// described from the wrong end, and it reads as if the assistant were the one
// asking. Hence the examples: models follow a wrong-but-concrete pattern far
// better than they follow "be user-centric".
export const TITLE_SYSTEM_PROMPT =
  "你在给一 tab 起标题。标题站在用户这边，写**用户**在这段对话里做了什么：" +
  "用动词开头的短语，不要写主语（不写「助手」「AI」「模型」「用户」「我」）。\n" +
  "好：「查看有哪些工具」「列出蓝图」「排查登录失败」「新建页面」\n" +
  "坏：「助手总结工具」「用户询问工具」「AI 列出蓝图」「我有哪些工具」\n" +
  "用户是在提问，就用「询问…」「了解…」「确认…」这类动词开头。" +
  "标题要短：中文不超过 10 个字，英文 2 到 4 个单词，用对话的主要语言。" +
  "只输出标题本身，不要引号、不要句末标点、不要解释。";

// textOf returns the prose of one record: text blocks only. A legacy row (no raw
// pi message) keeps its projection, which is already text-or-[image].
function textOf(r: StoredRecord): string {
  const content = r.raw?.content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const b of content) {
      // "thinking" and "toolCall" fall out here: the title is about the subject,
      // not about how the answer was produced.
      if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
        parts.push(b.text);
      }
    }
    return parts.join("\n");
  }
  return String(r.content ?? "");
}

// titleMaterial builds the text the title is summarized from: the conversation up
// to and including user turn `turns` (the first turn, since the title is written
// once), and the assistant prose inside it. `turns` is the user-turn number that
// triggered this call, so the window needs nothing persisted — it is derived from
// the records.
export function titleMaterial(
  records: StoredRecord[],
  turns: number,
  budget = MATERIAL_BUDGET,
): string {
  const parts: string[] = [];
  let turn = 0;
  for (const r of records) {
    if (r.role === "user") turn++;
    // Bounded by the trigger turn: a steered prompt recorded after the trigger is
    // a later turn and does not belong in this conversation's name yet.
    if (turn > turns) break;
    if (r.role !== "user" && r.role !== "assistant") continue;
    const text = textOf(r).trim();
    if (!text) continue;
    parts.push(`${r.role === "user" ? "用户" : "助手"}：${text}`);
  }
  const joined = parts.join("\n\n");
  if (joined.length <= budget) return joined;
  // Keep the opening (what the conversation was started for) and the end (where
  // it is now); the middle of a long window says the least about a title.
  const marker = "\n…\n";
  const tail = Math.max(0, budget - MATERIAL_HEAD - marker.length);
  return `${joined.slice(0, MATERIAL_HEAD)}${marker}${joined.slice(-tail)}`;
}

// Wrapping markup and a closing full stop come off in any order — `"标题"。` needs
// both, and one pass over each edge leaves the other behind. Trim until nothing
// changes.
const EDGE = /^[#>*\-\s"'“”‘’`「『]+|[\s"'“”‘’`」』。．.，,；;：:、!！?？~～]+$/g;
function trimEdges(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(EDGE, "");
  } while (s !== prev);
  return s;
}

// clampTitle is the backstop the prompt cannot be trusted with. Which budget
// applies is decided by the title's own script: no Han means English, so it is
// counted in words; any Han at all means Chinese, so it is counted in characters.
// A cut never lands inside a Latin word: half a word reads worse than a shorter
// title.
function clampTitle(t: string): string {
  if (!CJK.test(t)) {
    const words = t.split(/\s+/).filter(Boolean);
    return words.length <= MAX_WORDS ? t : words.slice(0, MAX_WORDS).join(" ");
  }
  const chars = [...t];
  let han = 0;
  let end = chars.length;
  for (let i = 0; i < chars.length; i++) {
    if (!CJK.test(chars[i])) continue;
    if (++han > MAX_CJK) {
      end = i;
      break;
    }
  }
  if (end === chars.length) return t;
  const cut = chars.slice(0, end).join("").trimEnd();
  // The cut may have landed mid-word ("修复 logi"): drop that whole word.
  return /[A-Za-z0-9]$/.test(cut) ? cut.replace(/[A-Za-z0-9'’._-]+$/, "").trimEnd() : cut;
}

// cleanTitle turns whatever the model wrote into something a tab can show: one
// line, no wrapping quotes or markdown, no trailing punctuation, short.
export function cleanTitle(raw: string): string {
  // Models like to answer with a preamble line; the title is the first line that
  // says anything.
  const line = String(raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
  let t = trimEdges(line.replace(/\s+/g, " ").trim());
  // A model that slips a subject in anyway ("助手总结工具", "用户询问工具") gets it
  // stripped: the tab names an action, and a wrong point of view is worse than a
  // slightly blunter phrase.
  const withoutSubject = t.replace(SUBJECT_PREFIX, "").trim();
  if (withoutSubject) t = withoutSubject;
  // Trimming again after the clamp: the cut can leave a comma or a full stop at
  // what is now the end of the title.
  return trimEdges(clampTitle(t));
}

// A title call holds this turn's stream open (it is sent out as a
// `session_title` event), so it has a deadline: past this, the conversation
// keeps the name it had rather than the tab waiting on a slow provider.
export const TITLE_TIMEOUT_MS = 15000;
