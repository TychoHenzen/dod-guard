import { matchSpan } from "./strip-lexical.mjs";
import {
  blankTemplateChar,
  closeInterp,
  closeTemplate,
  consumePlain,
  consumeSpan,
  consumeTemplateEscape,
  openInterp,
  openTemplate,
  trackBrace,
} from "./strip-frame-actions.mjs";

function opensTemplate(state) {
  return state.lang === "ts" && state.source[state.cursor.index] === "`";
}

function opensInterp(state) {
  const { source, cursor } = state;
  return source[cursor.index] === "$" && source[cursor.index + 1] === "{";
}

function stepCode(state) {
  if (opensTemplate(state)) return openTemplate(state);
  const span = matchSpan(state);
  if (span) return consumeSpan(state, span);
  consumePlain(state);
}

function stepInterp(state, frame) {
  if (opensTemplate(state)) return openTemplate(state);
  const span = matchSpan(state);
  if (span) return consumeSpan(state, span);
  const ch = state.source[state.cursor.index];
  if (trackBrace(frame, ch)) return closeInterp(state);
  consumePlain(state);
}

function stepTemplate(state) {
  const { source, cursor, parts } = state;
  const ch = source[cursor.index];
  if (ch === "\\") return consumeTemplateEscape(state);
  if (ch === "`") return closeTemplate(state);
  if (opensInterp(state)) return openInterp(state);
  parts.push(blankTemplateChar(ch));
  cursor.index += 1;
}

export function dispatch(state) {
  const frame = state.stack[state.stack.length - 1];
  if (frame.kind === "template") return stepTemplate(state);
  if (frame.kind === "interp") return stepInterp(state, frame);
  return stepCode(state);
}
