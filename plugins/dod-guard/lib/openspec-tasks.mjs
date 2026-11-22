// Reads an OpenSpec `tasks.md` into behavior slices, and writes and reads the
// category checklist of a slice sub-issue. A task group joins a slice through
// a `(slice: <name>)` tag on its heading, as in
// `## 2. Tests (slice: hand-size-limit)`; an untagged group stays in the parent.
// The publish and sync scripts share these readers, so the checklist format
// lives in one place. Every function is pure.
import { markedLines } from "./acceptance-criteria.mjs";

const GROUP = /^## +(\d+)\. +(.+?)(?: +\(slice: *([a-z0-9][a-z0-9-]*)\))?\s*$/;
const TASK = /^\s*- \[([ xX])\] +(?:(\d+(?:\.\d+)+) +)?(.+?)\s*$/;
const CATEGORY = /^### +(.+?)\s*$/;
const SLICE_MARK = /^<!-- openspec-slice: ([a-z0-9][a-z0-9-]*) -->\s*$/;

function taskFrom(match) {
  return { id: match[2] ?? null, text: match[3].replace(/\s+/g, " "), done: match[1] !== " " };
}

// Returns the task groups of a tasks.md file, in order, as { number,
// category, slice, tasks: [{ id, text, done }] }. `slice` is null for an
// untagged group. Tasks before the first group heading are dropped, because
// no group can own them.
function parseTasksFile(text) {
  const groups = [];
  for (const line of markedLines(text ?? "")) {
    if (line.fenced) continue;
    const group = GROUP.exec(line.text);
    if (group) {
      groups.push({ number: group[1], category: group[2], slice: group[3] ?? null, tasks: [] });
      continue;
    }
    const task = TASK.exec(line.text);
    if (task && groups.length > 0) groups.at(-1).tasks.push(taskFrom(task));
  }
  return groups;
}

// Groups task groups by slice tag, keeping the first-seen slice order.
// Returns { slices: [{ slice, categories: [{ category, tasks }] }],
// parentTasks: [{ category, tasks }] }. A category with no task is dropped,
// because a slice checklist shows a category only when it has work.
function slicesFrom(groups) {
  const slices = [];
  const parentTasks = [];
  for (const { category, slice, tasks } of groups) {
    if (tasks.length === 0) continue;
    if (slice === null) {
      parentTasks.push({ category, tasks });
      continue;
    }
    let target = slices.find((entry) => entry.slice === slice);
    if (!target) {
      target = { slice, categories: [] };
      slices.push(target);
    }
    target.categories.push({ category, tasks });
  }
  return { slices, parentTasks };
}

function sliceTitle(slice) {
  const words = slice.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function taskLine(task) {
  const box = task.done ? "[x]" : "[ ]";
  return task.id ? `- ${box} ${task.id} ${task.text}` : `- ${box} ${task.text}`;
}

// The sub-issue body of one slice: a marker that names the slice, so a second
// publish and the sync step find the same sub-issue, then one heading per
// category with its checklist.
function renderSliceBody({ slice, categories }, parentIssue) {
  const lines = [
    `<!-- openspec-slice: ${slice} -->`,
    `Part of #${parentIssue}. This slice ships working, with its tests passing.`,
    "",
    "## Tasks",
  ];
  for (const { category, tasks } of categories) {
    lines.push("", `### ${category}`, "", ...tasks.map(taskLine));
  }
  return `${lines.join("\n")}\n`;
}

// Reads a slice sub-issue body. Returns { slice, items: [{ category, id,
// text, checked }] }, with slice null when the body has no slice marker.
function parseSliceBody(body) {
  let slice = null;
  let category = null;
  const items = [];
  for (const line of markedLines(body ?? "")) {
    if (line.fenced) continue;
    slice ??= SLICE_MARK.exec(line.text)?.[1] ?? null;
    category = CATEGORY.exec(line.text)?.[1] ?? category;
    const task = TASK.exec(line.text);
    if (task) {
      const { id, text, done } = taskFrom(task);
      items.push({ category, id, text, checked: done });
    }
  }
  return { slice, items };
}

// The key a local task and an issue checklist item match on. Ids are left out
// because a hand-written checklist may not carry them; case, emphasis marks,
// spacing, and a trailing period do not change which task a line names.
function taskKey(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s.]+$/, "")
    .trim();
}

// Ticks every unchecked checklist item of a slice body whose taskKey is in
// `keys`, outside fenced blocks. It never unticks, so an item ticked by hand
// stays ticked. Returns the new body with LF line endings.
function tickSliceItems(body, keys) {
  return markedLines(body ?? "")
    .map((line) => {
      const task = line.fenced ? null : TASK.exec(line.text);
      if (!task || task[1] !== " " || !keys.has(taskKey(task[3]))) return line.text;
      return line.text.replace("[ ]", "[x]");
    })
    .join("\n");
}

export { parseSliceBody, parseTasksFile, renderSliceBody, slicesFrom, sliceTitle, taskKey, tickSliceItems };
