const NOT_CALLABLE = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "do",
  "else",
  "return",
  "with",
  "using",
  "lock",
  "fixed",
  "unsafe",
  "foreach",
  "match",
  "when",
  "new",
  "typeof",
  "sizeof",
  "await",
  "yield",
  "throw",
  "assert",
  "print",
  "and",
  "or",
  "not",
  "in",
  "is",
  "as",
]);
const RUST_SELF_RECEIVER = /^&?\s*(?:'[A-Za-z_]\w*\s+)?(?:mut\s+)?self$/;

function nextParamDepth(depth, ch) {
  if ("([{<".includes(ch)) return depth + 1;
  if (")]}>".includes(ch)) return depth - 1;
  return depth;
}

function startsQuote(text, index, ch) {
  return ch !== "'" || !["&", ":", "<", ">"].includes(text[index - 1]);
}

function nextQuoteState(state, ch) {
  const escaped = state.escaped;
  state.escaped = !escaped && ch === "\\";
  if (!escaped && ch === state.quote) state.quote = undefined;
}

function appendUnquoted(state, ch, params) {
  state.depth = nextParamDepth(state.depth, ch);
  if (ch === "," && state.depth === 0) {
    params.push(state.current);
    state.current = "";
    return;
  }
  state.current += ch;
}

function splitTopLevel(text) {
  const params = [];
  const state = { depth: 0, current: "" };
  let quoteState = { quote: undefined, escaped: false };
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quoteState.quote) {
      state.current += ch;
      nextQuoteState(quoteState, ch);
      continue;
    }
    if (`\"'\``.includes(ch) && startsQuote(text, index, ch)) {
      quoteState = { quote: ch, escaped: false };
      state.current += ch;
      continue;
    }
    appendUnquoted(state, ch, params);
  }
  params.push(state.current);
  return params;
}

function isParameter(param) {
  return (
    param.length > 0 && param !== "this" && !RUST_SELF_RECEIVER.test(param)
  );
}

export function splitParams(text) {
  return splitTopLevel(text)
    .map((param) => param.trim())
    .filter(isParameter);
}

export function isCallable(name) {
  return !NOT_CALLABLE.has(name);
}
