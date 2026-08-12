// tasks.mjs - read task text out of a change's tasks.md.
//
// No reporting command returns it. `show --type change --json` gives deltas
// only, and `list --json` gives completed and total counts with no text. The
// parse fails soft: an unreadable file returns null and the change still
// renders, because its progress counts come from the CLI rather than here.

import { readFileSync } from "node:fs";

const SECTION = /^##\s+(.*\S)\s*$/;
const ITEM = /^\s*-\s+\[([ xX])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
const CONTINUATION = /^\s+\S/;

function startSection(state, title) {
  state.section = { title, items: [] };
  state.sections.push(state.section);
  state.item = null;
}

function startItem(state, match) {
  if (!state.section) startSection(state, "Tasks");
  state.item = { id: match[2] ?? "", text: match[3].trim(), done: match[1] !== " " };
  state.section.items.push(state.item);
}

function continueItem(state, line) {
  const extra = line.trim();
  if (state.item && extra) state.item.text += ` ${extra}`;
}

function applyLine(state, line) {
  const section = line.match(SECTION);
  if (section) return startSection(state, section[1]);
  const item = line.match(ITEM);
  if (item) return startItem(state, item);
  if (CONTINUATION.test(line)) return continueItem(state, line);
  state.item = null;
}

/** Sections of checkbox items, or null when the file cannot be read. */
export function parseTasks(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const state = { sections: [], section: null, item: null };
  for (const line of text.split(/\r?\n/)) applyLine(state, line);
  return state.sections.filter((section) => section.items.length > 0);
}
