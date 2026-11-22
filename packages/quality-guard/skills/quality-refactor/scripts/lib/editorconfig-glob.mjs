// Matches an EditorConfig section name against a file path. A name with a "/"
// is anchored to the directory holding the .editorconfig; a name without one
// matches at any depth. editorconfig-glob-parse.mjs defines the syntax.
//
// The section name comes from the scanned repository, so it is untrusted. A
// backtracking regex would take exponential time on names such as thirty "*"
// in a row. Instead the tokens become a Thompson NFA, and the match walks the
// path once, keeping the set of states live at each position. The cost is
// about states x path length; a numeric range adds a scan of the digit run
// at each position it is live.

import { DIRECTORIES, parseGlob } from "./editorconfig-glob-parse.mjs";

const cache = new Map();
const isDigit = (c) => c >= "0" && c <= "9";

// nfa.states[i] lists the edges leaving state i: { kind: "eps", to }
// consumes nothing, { kind: "char", test, to } one character, and
// { kind: "range", range, to } a whole number.
const newState = (nfa) => nfa.states.push([]) - 1;
const link = (nfa, from, out) => nfa.states[from].push(out);

// Each step adds one token after state `from` and returns its end state.
function charStep(nfa, token, from) {
  const to = newState(nfa);
  link(nfa, from, { kind: "char", test: token.test, to });
  return to;
}

// A fresh state per repeat, so "[a]*[b]*" cannot accept "ba".
function repeatStep(nfa, token, from) {
  const loop = newState(nfa);
  link(nfa, from, { kind: "eps", to: loop });
  link(nfa, loop, { kind: "char", test: token.test, to: loop });
  return loop;
}

function altStep(nfa, token, from) {
  const join = newState(nfa);
  for (const option of token.options) {
    const start = newState(nfa);
    link(nfa, from, { kind: "eps", to: start });
    link(nfa, buildSequence(nfa, option, start), { kind: "eps", to: join });
  }
  return join;
}

function rangeStep(nfa, token, from) {
  const to = newState(nfa);
  link(nfa, from, { kind: "range", range: token, to });
  return to;
}

const STEPS = {
  char: charStep,
  repeat: repeatStep,
  alt: altStep,
  range: rangeStep,
};

function buildSequence(nfa, tokens, start) {
  return tokens.reduce(
    (at, token) => STEPS[token.kind](nfa, token, at),
    start,
  );
}

function buildNfa(tokens) {
  const nfa = { states: [], start: 0, accept: 0 };
  nfa.start = newState(nfa);
  nfa.accept = buildSequence(nfa, tokens, nfa.start);
  return nfa;
}

// Adds `state` and every state reachable from it by "eps" edges.
function addClosure(nfa, live, state) {
  const pending = [state];
  while (pending.length > 0) {
    const next = pending.pop();
    if (live.has(next)) continue;
    live.add(next);
    for (const out of nfa.states[next]) {
      if (out.kind === "eps") pending.push(out.to);
    }
  }
}

// Ends of every "-?digits" run starting at `from` whose value is in range.
// ASSUMPTION: numbers compare by value, so "01" is in {1..3}, as in
// editorconfig-core; BigInt keeps huge endpoints exact.
function numberEnds(path, from, { low, high }) {
  const ends = [];
  const digits = path[from] === "-" ? from + 1 : from;
  for (let end = digits + 1; end <= path.length; end += 1) {
    if (!isDigit(path[end - 1])) break;
    const value = BigInt(path.slice(from, end));
    if (low <= value && value <= high) ends.push(end);
  }
  return ends;
}

// Positions an edge leaving `at` can reach.
const MOVES = {
  eps: () => [],
  char: (out, path, at) =>
    at < path.length && out.test(path[at]) ? [at + 1] : [],
  range: (out, path, at) => numberEnds(path, at, out.range),
};

// Follows edge `out` from position `at` and marks what it reaches as live.
function reach({ nfa, path, live }, out, at) {
  for (const end of MOVES[out.kind](out, path, at)) {
    addClosure(nfa, live[end], out.to);
  }
}

function accepts(nfa, path) {
  const live = Array.from({ length: path.length + 1 }, () => new Set());
  const walk = { nfa, path, live };
  addClosure(nfa, live[0], nfa.start);
  // Every move consumes at least one character, so a set is complete before
  // the walk reaches its position.
  for (let at = 0; at <= path.length; at += 1) {
    for (const state of live[at]) {
      for (const out of nfa.states[state]) reach(walk, out, at);
    }
  }
  return live[path.length].has(nfa.accept);
}

function compile(pattern) {
  const anchored = pattern.includes("/");
  const tokens = parseGlob(anchored ? pattern.replace(/^\//, "") : pattern);
  return buildNfa(anchored ? tokens : [DIRECTORIES, ...tokens]);
}

/**
 * True when the EditorConfig section `pattern` covers `relFromConfigDir`, the
 * file's path relative to the directory holding the .editorconfig.
 */
export function matchesSection(pattern, relFromConfigDir) {
  if (!cache.has(pattern)) {
    try {
      cache.set(pattern, compile(pattern));
    } catch {
      cache.set(pattern, null);
    }
  }
  const nfa = cache.get(pattern);
  return nfa !== null && accepts(nfa, relFromConfigDir);
}
