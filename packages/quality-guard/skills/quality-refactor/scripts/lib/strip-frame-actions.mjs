import { extractCaptures } from "./strip-captures.mjs";
import { blank } from "./strip-readers.mjs";

function advancePrevious(previous, ch) {
  if (/\s/.test(ch)) {
    if (ch === "\n") previous.char = "\n";
    return;
  }
  previous.char = ch;
  previous.word = /\w/.test(ch) ? previous.word + ch : "";
}

export function consumeSpan(state, span) {
  const { source, cursor, comments, parts, previous, interpolations } = state;
  const at = cursor.index;
  const raw = source.slice(at, span.end);
  if (span.isComment) comments.push({ line: cursor.line, text: raw });
  if (!span.isComment) previous.char = "x";
  if (span.captures)
    interpolations.push(...extractCaptures(raw, cursor.line, span.captures));
  parts.push(blank(raw));
  previous.word = "";
  cursor.index = span.end;
}

export function consumePlain(state) {
  const { source, cursor, parts, previous } = state;
  const ch = source[cursor.index];
  parts.push(ch);
  advancePrevious(previous, ch);
  cursor.index += 1;
}

export function openTemplate(state) {
  state.parts.push(" ");
  state.cursor.index += 1;
  state.stack.push({ kind: "template" });
  state.previous.char = "x";
  state.previous.word = "";
}

export function closeTemplate(state) {
  state.parts.push(" ");
  state.cursor.index += 1;
  state.stack.pop();
  state.previous.char = "x";
  state.previous.word = "";
}

export function openInterp(state) {
  state.parts.push("  ");
  state.cursor.index += 2;
  state.stack.push({ kind: "interp", depth: 0 });
  state.previous.char = "{";
  state.previous.word = "";
}

export function closeInterp(state) {
  state.parts.push(" ");
  state.cursor.index += 1;
  state.stack.pop();
  state.previous.char = "x";
  state.previous.word = "";
}

export function consumeTemplateEscape(state) {
  const { source, cursor, parts } = state;
  const raw = source.slice(cursor.index, cursor.index + 2);
  parts.push(blank(raw));
  cursor.index += raw.length;
}

export function blankTemplateChar(ch) {
  return ch === "\n" ? "\n" : " ";
}

export function trackBrace(frame, ch) {
  if (ch === "{") {
    frame.depth += 1;
    return false;
  }
  if (ch !== "}") return false;
  if (frame.depth === 0) return true;
  frame.depth -= 1;
  return false;
}
