import { matchBracket } from "./offsets.mjs";

const BRACKET_DEPTH = { "(": 1, "[": 1, "{": 1, ")": -1, "]": -1, "}": -1 };
const ANGLE_DEPTH = { "<": 1, ">": -1 };

// ponytail: nested commas are flattened; a full C# parser is the upgrade path.
function isDefaultValue(state, character) {
  return state.defaultValue || (character === "=" && state.depth === 0 && state.angleDepth === 0);
}

function angleChange(state, character) {
  return state.defaultValue ? 0 : ANGLE_DEPTH[character] || 0;
}

function updateDepth(state, character) {
  state.defaultValue = isDefaultValue(state, character);
  state.depth += BRACKET_DEPTH[character] || 0;
  state.angleDepth = Math.max(
    0,
    state.angleDepth + angleChange(state, character),
  );
}

function positionalCharacter(state, character) {
  if (character !== ",") return character;
  return state.depth === 0 && state.angleDepth === 0 ? ";" : " ";
}

function positionalBody(parameters) {
  const state = { depth: 0, angleDepth: 0, defaultValue: false };
  const blanked = parameters.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (literal) => " ".repeat(literal.length));
  return [...blanked].map((character) => {
    updateDepth(state, character);
    return positionalCharacter(state, character);
  }).join("");
}

function bodyAfter({ searchable, start, parameters }) {
  const terminator = /[;{]/.exec(searchable.slice(start));
  if (terminator?.[0] === "{") {
    const tail = searchable.slice(start, start + terminator.index);
    if (!/^\s*(?::[\s\S]*|where\b[\s\S]*)?\s*$/.test(tail)) return null;
    return undefined;
  }
  if (terminator?.[0] !== ";") return undefined;
  return {
    start,
    end: start + terminator.index,
    text: positionalBody(parameters),
  };
}

export function csharpRecordBody({ source, searchable, match }) {
  if (!/^record(?:\s+struct)?$/.test(match[1])) return undefined;
  const offset = match.index + match[0].length;
  const openMatch = /^\s*\(/.exec(searchable.slice(offset));
  if (!openMatch) return bodyAfter({ searchable, start: offset, parameters: "" });
  const open = offset + openMatch[0].length - 1;
  const close = matchBracket(searchable, open, "()");
  if (close === -1) return null;
  return bodyAfter({ searchable, start: close + 1, parameters: searchable.slice(open + 1, close) });
}
