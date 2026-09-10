import { lineAt } from "./offsets.mjs";

const TYPE_KEYWORDS = {
  ts: /\b(?:abstract\s+)?(class|interface|enum|type)\s+([A-Za-z_$][\w$]*)/g,
  cs: /\b(class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/g,
  rs: /\b(struct|enum|trait|union)\s+([A-Za-z_]\w*)/g,
  go: /\btype\s+([A-Za-z_]\w*)\s+(struct|interface)\b/g,
  java: /\b(class|interface|enum|record)\s+([A-Za-z_]\w*)/g,
  cpp: /\b(class|struct|enum)\s+([A-Za-z_]\w*)/g,
  py: /^class\s+([A-Za-z_]\w*)/gm,
};
const CONTAINER_BLOCK = /\b(?:namespace|mod|package)\s+[\w.:]*\s*\{/g;
const RUST_IMPL_HEADER = new RegExp(
  String.raw`\bimpl(?:<[^{}]*>)?\s+` +
    String.raw`(?:[A-Za-z_][\w:]*(?:<[^{}]*>)?\s+for\s+)?` +
    String.raw`([A-Za-z_][\w:]*)(?:<[^{}]*>)?\s*(?:where[^{]*)?\{`,
  "g",
);

function containerOpens(code) {
  const opens = new Set();
  CONTAINER_BLOCK.lastIndex = 0;
  let match = CONTAINER_BLOCK.exec(code);
  while (match !== null) {
    opens.add(match.index + match[0].length - 1);
    match = CONTAINER_BLOCK.exec(code);
  }
  return opens;
}

function advanceDepth({ code, state, skip, offset }) {
  while (state.cursor < offset) {
    updateDepth({ ch: code[state.cursor], state, skip, cursor: state.cursor });
    state.cursor += 1;
  }
  return state.depth;
}

function updateDepth({ ch, state, skip, cursor }) {
  if (ch === "{") {
    const ignored = skip.has(cursor);
    state.stack.push(ignored);
    state.depth += !ignored;
  }
  if (ch === "}" && state.stack.pop() === false) state.depth -= 1;
}

function depthTracker(code) {
  const state = { cursor: 0, depth: 0, stack: [] };
  const skip = containerOpens(code);
  return (offset) => advanceDepth({ code, state, skip, offset });
}

function typeName(lang, isPy, match) {
  return lang === "go" || isPy ? match[1] : match[2];
}
function collectTypes({ code, lang, starts, pattern }) {
  const isPy = lang === "py";
  const depthAt = depthTracker(code);
  const found = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match !== null) {
    if (isPy || depthAt(match.index) === 0) {
      found.push({
        name: typeName(lang, isPy, match),
        line: lineAt(starts, match.index),
        offset: match.index,
      });
    }
    match = pattern.exec(code);
  }
  return found;
}

export function findTypes(code, lang, starts) {
  const pattern = TYPE_KEYWORDS[lang];
  return pattern ? collectTypes({ code, lang, starts, pattern }) : [];
}

export function findRustImpls(code) {
  const depthAt = depthTracker(code);
  const found = [];
  RUST_IMPL_HEADER.lastIndex = 0;
  let match = RUST_IMPL_HEADER.exec(code);
  while (match !== null) {
    if (depthAt(match.index) === 0)
      found.push({ typeName: match[1], offset: match.index });
    match = RUST_IMPL_HEADER.exec(code);
  }
  return found;
}
