import {
  closingQuote,
  groupEnd,
  isGroupOpen,
  isUnion,
  nameTail,
  nextToken,
  numberAt,
  opensParameterList,
  skipSpace,
  wordAt,
} from "./parse-type-tokens.mjs";

// Reads a TypeScript return-type annotation as an iterative state machine over
// the stripped code. The lexical helpers live in parse-type-tokens.mjs. The raw
// source is read only to find quoted literals, which strip blanks to whitespace
// while keeping offsets.

// Words that can precede an operand. Each one is consumed as a whole word.
const PREFIX_WORDS = new Set([
  "typeof",
  "keyof",
  "readonly",
  "unique",
  "infer",
  "asserts",
  "new",
]);

// A step returns undefined to keep reading, or the final offset (or -1) to
// stop. Every step that keeps reading consumes at least one character, so the
// loop finishes within code.length steps. The bound is a backstop only.
function readType(code, source, from) {
  const ctx = { code, source };
  const state = {
    i: from,
    end: from,
    expecting: true,
    word: false,
    frames: [],
  };
  for (let steps = 0; steps <= code.length; steps += 1) {
    const done = step(ctx, state);
    if (done !== undefined) {
      return done;
    }
  }
  return -1;
}

function step(ctx, state) {
  if (state.expecting) {
    return expectStep(ctx, state);
  }
  return afterStep(ctx, state);
}

// Moves the cursor to `at`, where a type is expected next.
function expectAt(state, at) {
  state.i = at;
  state.expecting = true;
  state.word = false;
}

// Marks an operand complete. `end` is the offset just after it.
function completeOperand(state, end, isWord) {
  state.i = end;
  state.end = end;
  state.word = isWord;
  state.expecting = false;
}

function expectStep(ctx, state) {
  const token = nextToken(ctx.code, ctx.source, state.i);
  if (token.quote !== undefined) {
    return literalOperand(ctx, state, token.quote);
  }
  if (token.at >= ctx.code.length) {
    return -1;
  }
  return operandAt(ctx, state, token.at);
}

function literalOperand(ctx, state, open) {
  const close = closingQuote(ctx.source, open);
  if (close === -1) {
    return -1;
  }
  return completeOperand(state, close + 1, false);
}

function operandAt(ctx, state, i) {
  const { code } = ctx;
  if (isUnion(code, i)) {
    return expectAt(state, i + 1);
  }
  const number = numberAt(code, i);
  if (number !== "") {
    return completeOperand(state, i + number.length, false);
  }
  const word = wordAt(code, i);
  if (PREFIX_WORDS.has(word)) {
    return expectAt(state, i + word.length);
  }
  if (word !== "") {
    return identifierOperand(ctx, state, i, word);
  }
  if (isGroupOpen(code[i])) {
    return groupOperand(ctx, state, i);
  }
  return failure(state);
}

// A dotted identifier, optionally followed by generic arguments. A plain name
// stays eligible for a following "is" predicate.
function identifierOperand(ctx, state, i, word) {
  const { code } = ctx;
  const start = i + word.length;
  const open = skipSpace(code, start);
  if (code[open] === "(") {
    return queryOperand(state, code, open);
  }
  const end = nameTail(code, start);
  if (end === -1) {
    return -1;
  }
  return completeOperand(state, end, end === start);
}

// An import("...") type query. The group after the name is part of the type
// name, so the name may continue with ".member" and generic arguments.
function queryOperand(state, code, open) {
  const close = groupEnd(code, open);
  if (close === -1) {
    return -1;
  }
  const end = nameTail(code, close + 1);
  if (end === -1) {
    return -1;
  }
  return completeOperand(state, end, false);
}

// A "{", "[" or "(" group. A "(" group is a function type only when it is followed
// by "=>" and its contents can start a parameter list. Otherwise it is a
// parenthesized type, and the "=>" after it belongs to the caller.
function groupOperand(ctx, state, i) {
  const { code } = ctx;
  const close = groupEnd(code, i);
  if (close === -1) {
    return -1;
  }
  const after = skipSpace(code, close + 1);
  if (code[i] === "(" && code.startsWith("=>", after) && opensParameterList(code, ctx.source, i)) {
    return expectAt(state, after + 2);
  }
  return completeOperand(state, close + 1, false);
}

function afterStep(ctx, state) {
  const { code } = ctx;
  // ASSUMPTION: a quoted literal directly after a complete operand is not valid
  // TypeScript, so its blanked text is skipped as whitespace here instead of
  // ending the type.
  const i = skipSpace(code, state.i);
  if (i >= code.length) {
    return endOfInput(state);
  }
  if (code[i] === "[") {
    return postfixGroup(code, state, i);
  }
  if (isUnion(code, i)) {
    return expectAt(state, i + 1);
  }
  const word = wordAt(code, i);
  if (word === "extends") {
    return startConditional(state, i, word.length);
  }
  if (word === "is" && state.word) {
    return expectAt(state, i + word.length);
  }
  return conditionalToken(state, code[i], i);
}

// An indexed access or array type. It keeps the operand open for more.
function postfixGroup(code, state, i) {
  const close = groupEnd(code, i);
  if (close === -1) {
    return -1;
  }
  return completeOperand(state, close + 1, false);
}

function startConditional(state, i, length) {
  state.frames.push({ phase: "extends", mark: state.end });
  return expectAt(state, i + length);
}

// Once a false branch reaches a token it cannot continue, its conditional is
// complete and can be dropped from the stack.
function popCompleteFrames(state) {
  while (state.frames.at(-1)?.phase === "false") {
    state.frames.pop();
  }
}

function advanceFrame(state, frame, phase, i) {
  frame.phase = phase;
  return expectAt(state, i + 1);
}

function conditionalToken(state, ch, i) {
  popCompleteFrames(state);
  const top = state.frames.at(-1);
  if (top?.phase === "extends" && ch === "?") {
    return advanceFrame(state, top, "true", i);
  }
  if (top?.phase === "true" && ch === ":") {
    return advanceFrame(state, top, "false", i);
  }
  return failure(state);
}

function endOfInput(state) {
  popCompleteFrames(state);
  if (state.frames.length > 0) {
    return -1;
  }
  return state.end;
}

// ASSUMPTION: an unrecognized token ends the type and the caller then reports
// no body, which trades a possible missed function for never inventing a body.
// With a conditional still open, the annotation ends before the outermost
// "extends" instead; the caller reports no body either way.
function failure(state) {
  if (state.frames.length > 0) {
    return state.frames[0].mark;
  }
  return state.end;
}

// Returns the offset just after the return-type annotation that starts at
// `from`, the offset just after the ")" of a parameter list. Returns `from`
// when there is no annotation, and -1 when the annotation is truncated or
// unbalanced. `source` is the raw text with the same offsets as `code`.
export function skipReturnType(code, from, source) {
  const colon = skipSpace(code, from);
  if (code[colon] !== ":") {
    return from;
  }
  return readType(code, source, colon + 1);
}
