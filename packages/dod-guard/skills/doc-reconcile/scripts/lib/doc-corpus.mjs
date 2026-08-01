// Splits a repository's tracked documentation into claim units: one paragraph,
// one top-level list item, one table row, or one JSON description string. Later
// steps score and pair these units to find claims that contradict each other.

import { execFileSync } from "node:child_process";

const MANIFEST_RE = /(^|\/)\.claude-plugin\/(plugin|marketplace)\.json$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(```|~~~)/;
const LIST_ITEM_RE = /^([-*+]|\d+\.)\s+/;
const DESCRIPTION_RE = /"description"\s*:/;

function gitRun(args, root) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function isDocPath(path) {
  return path.endsWith(".md") || MANIFEST_RE.test(path);
}

// `run` takes an argument list and returns stdout. Omit it to shell out to the
// real git binary against `root`.
export function listDocFiles(root, run) {
  const runner = run ?? ((args) => gitRun(args, root));
  const output = runner(["ls-files"]);
  const files = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return files.filter(isDocPath).sort();
}

function isTableSeparatorRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = trimmed.split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

function startsTable(lines, index) {
  const line = lines[index];
  return line.includes("|") && index + 1 < lines.length && isTableSeparatorRow(lines[index + 1]);
}

function updateHeadingStack(stack, level, text) {
  while (stack.length > 0 && stack.at(-1).level >= level) {
    stack.pop();
  }
  stack.push({ level, text });
}

function headingTrail(stack) {
  return stack.map((entry) => entry.text).join(" > ");
}

function makeUnit(ctx, spec) {
  return {
    file: ctx.file,
    startLine: spec.start,
    endLine: spec.end,
    kind: spec.kind,
    heading: headingTrail(ctx.headingStack),
    text: spec.text,
  };
}

function consumeTable(ctx, index) {
  const units = [];
  let cursor = index + 2;
  while (cursor < ctx.lines.length && ctx.lines[cursor].trim() !== "" && ctx.lines[cursor].includes("|")) {
    units.push(makeUnit(ctx, { kind: "table-row", start: cursor + 1, end: cursor + 1, text: ctx.lines[cursor] }));
    cursor++;
  }
  return { units, next: cursor };
}

function isListContinuation(line) {
  return /^\s+\S/.test(line);
}

function consumeListItem(ctx, index) {
  let cursor = index + 1;
  while (cursor < ctx.lines.length) {
    const line = ctx.lines[cursor];
    if (line.trim() === "" || LIST_ITEM_RE.test(line) || HEADING_RE.test(line) || !isListContinuation(line)) {
      break;
    }
    cursor++;
  }
  const text = ctx.lines.slice(index, cursor).join("\n");
  const unit = makeUnit(ctx, { kind: "list-item", start: index + 1, end: cursor, text });
  return { unit, next: cursor };
}

function paragraphStop(lines, cursor) {
  const line = lines[cursor];
  return (
    line.trim() === "" ||
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    LIST_ITEM_RE.test(line) ||
    startsTable(lines, cursor)
  );
}

function consumeParagraph(ctx, index) {
  let cursor = index;
  while (cursor < ctx.lines.length && !paragraphStop(ctx.lines, cursor)) {
    cursor++;
  }
  const text = ctx.lines.slice(index, cursor).join("\n");
  const unit = makeUnit(ctx, { kind: "paragraph", start: index + 1, end: cursor, text });
  return { unit, next: cursor };
}

function frontmatterEnd(lines) {
  if (lines[0] !== "---") {
    return 0;
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      return i + 1;
    }
  }
  return 0;
}

function processMarkdown(file, lines) {
  const ctx = { file, lines, headingStack: [] };
  const units = [];
  let fenceMarker = "";
  let index = frontmatterEnd(lines);

  while (index < lines.length) {
    const line = lines[index];

    if (fenceMarker && line.trim().startsWith(fenceMarker)) {
      fenceMarker = "";
      index++;
      continue;
    }
    if (fenceMarker) {
      index++;
      continue;
    }
    if (line.trim() === "") {
      index++;
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      updateHeadingStack(ctx.headingStack, headingMatch[1].length, headingMatch[2].trim());
      index++;
      continue;
    }

    const fenceOpen = line.match(FENCE_RE);
    if (fenceOpen) {
      fenceMarker = fenceOpen[1];
      index++;
      continue;
    }

    if (startsTable(lines, index)) {
      const result = consumeTable(ctx, index);
      units.push(...result.units);
      index = result.next;
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const result = consumeListItem(ctx, index);
      units.push(result.unit);
      index = result.next;
      continue;
    }

    const result = consumeParagraph(ctx, index);
    units.push(result.unit);
    index = result.next;
  }

  return units;
}

function walkJsonDescriptions(value, path, out) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkJsonDescriptions(item, path ? `${path}.${i}` : String(i), out));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, val] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (key === "description" && typeof val === "string") {
      out.push({ path: next, value: val });
    } else {
      walkJsonDescriptions(val, next, out);
    }
  }
}

function findDescriptionLine(lines, from) {
  for (let i = from; i < lines.length; i++) {
    if (DESCRIPTION_RE.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

function jsonUnit(file, entry, lineNumber) {
  return {
    file,
    startLine: lineNumber,
    endLine: lineNumber,
    kind: "json-description",
    heading: entry.path,
    text: entry.value,
  };
}

function processJson(file, text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const found = [];
  walkJsonDescriptions(data, "", found);
  const lines = text.split(/\r?\n/);
  let searchFrom = 0;
  return found.map((entry) => {
    const lineIndex = findDescriptionLine(lines, searchFrom);
    searchFrom = lineIndex === -1 ? searchFrom : lineIndex + 1;
    return jsonUnit(file, entry, lineIndex === -1 ? 1 : lineIndex + 1);
  });
}

// Splits one file's text into claim units. `file` decides the format: `.json`
// walks for `description` strings, everything else is parsed as markdown.
export function splitClaims(file, text) {
  if (typeof text !== "string" || text.trim() === "") {
    return [];
  }
  if (file.endsWith(".json")) {
    return processJson(file, text);
  }
  return processMarkdown(file, text.split(/\r?\n/));
}
