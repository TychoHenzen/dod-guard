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

// Each state is a list of edges: { kind: "eps", to } consumes nothing,
// { kind: "char", test, to } one character, { kind: "range", range, to } a
// whole number.
function buildNfa(tokens) {
  const states = [];
  const newState = () => states.push([]) - 1;
  const edge = (from, kind, to, extra) =>
    states[from].push({ kind, to, ...extra });
  const steps = {
    char(token, from) {
      const to = newState();
      edge(from, "char", to, { test: token.test });
      return to;
    },
    // A fresh state per repeat, so "[a]*[b]*" cannot accept "ba".
    repeat(token, from) {
      const loop = newState();
      edge(from, "eps", loop);
      edge(loop, "char", loop, { test: token.test });
      return loop;
    },
    alt(token, from) {
      const join = newState();
      for (const option of token.options) {
        const start = newState();
        edge(from, "eps", start);
        edge(sequence(option, start), "eps", join);
      }
      return join;
    },
    range(token, from) {
      const to = newState();
      edge(from, "range", to, { range: token });
      return to;
    },
  };
  const sequence = (run, first) =>
    run.reduce((at, token) => steps[token.kind](token, at), first);
  const start = newState();
  return { states, start, accept: sequence(tokens, start) };
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

function accepts(nfa, path) {
  const live = Array.from({ length: path.length + 1 }, () => new Set());
  addClosure(nfa, live[0], nfa.start);
  // Every move consumes at least one character, so a set is complete before
  // the walk reaches its position.
  for (let at = 0; at <= path.length; at += 1) {
    for (const state of live[at]) {
      for (const out of nfa.states[state]) {
        for (const end of MOVES[out.kind](out, path, at)) {
          addClosure(nfa, live[end], out.to);
        }
      }
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
