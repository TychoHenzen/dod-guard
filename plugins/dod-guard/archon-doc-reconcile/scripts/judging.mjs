// Queueing pairs for the judge sessions and recording their replies.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { claimOf, readJson, statePath, writeJson } from "./claims.mjs";

// The skill's cap: at most 20 judge dispatches per run, re-dispatches included.
export const BUDGET = 20;
export const VERDICTS = ["CONFLICT", "DUPLICATE", "STALE-SUBSET", "UNRELATED"];
const WHITESPACE = /\s+/g;

function squash(text) {
  return String(text ?? "")
    .replace(WHITESPACE, " ")
    .trim();
}

function quotedIn(span, text) {
  const wanted = squash(span);
  return wanted !== "" && squash(text).includes(wanted);
}

// A CONFLICT must quote words from each claim; the judge may name them in either order.
function conflictEvidenceProblem(reply, pair) {
  const { evidenceA, evidenceB } = reply;
  const straight = quotedIn(evidenceA, pair.a.text) && quotedIn(evidenceB, pair.b.text);
  const crossed = quotedIn(evidenceA, pair.b.text) && quotedIn(evidenceB, pair.a.text);
  return straight || crossed ? null : "the CONFLICT evidence does not quote words from each claim";
}

// Returns null for a usable reply, otherwise what is wrong with it.
export function replyProblem(reply, pair) {
  if (reply === null || typeof reply !== "object") {
    return "the judge wrote no reply";
  }
  if (!VERDICTS.includes(reply.verdict)) {
    return `unknown verdict ${JSON.stringify(reply.verdict)}`;
  }
  if (squash(reply.why) === "") {
    return "the reply gives no reason";
  }
  return reply.verdict === "CONFLICT" ? conflictEvidenceProblem(reply, pair) : null;
}

function settled(state, id) {
  return id in state.verdicts || id in state.undecided;
}

// The next pair is the first one without a verdict. A malformed reply leaves
// its pair first in line, which is the skill's one re-dispatch.
function queueNext(dir, state) {
  const open = state.pairs.filter((pair) => !settled(state, pair.id));
  if (state.dispatches >= BUDGET) {
    for (const pair of open) {
      state.undecided[pair.id] = { reason: "out of budget", detail: `the run judged ${BUDGET} times` };
    }
  }
  const next = state.dispatches >= BUDGET ? undefined : open[0];
  state.current = next ? next.id : null;
  const currentPath = join(dir, "current.json");
  rmSync(currentPath, { force: true });
  if (next) {
    writeJson(currentPath, { id: next.id, a: claimOf(next.a), b: claimOf(next.b) });
  }
  writeJson(statePath(dir), state);
}

export function prep({ dir, candidates }) {
  const scan = readJson(candidates);
  const pairs = scan.pairs.map((pair, index) => ({ id: `p${index + 1}`, score: pair.score, a: pair.a, b: pair.b }));
  const state = { scan: scan.options, pairs, dispatches: 0, attempts: {}, verdicts: {}, undecided: {}, current: null };
  rmSync(join(dir, "verdict.json"), { force: true });
  queueNext(dir, state);
  return pairs.length;
}

function readReply(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function recordReply(state, pair, reply) {
  const problem = replyProblem(reply, pair);
  if (problem === null) {
    state.verdicts[pair.id] = {
      verdict: reply.verdict,
      evidenceA: squash(reply.evidenceA),
      evidenceB: squash(reply.evidenceB),
      why: squash(reply.why),
    };
    return;
  }
  state.attempts[pair.id] = (state.attempts[pair.id] ?? 0) + 1;
  if (state.attempts[pair.id] >= 2) {
    state.undecided[pair.id] = { reason: "malformed verdict", detail: problem };
  }
}

// Returns true once every pair is settled.
export function advance({ dir }) {
  const state = readJson(statePath(dir));
  const pair = state.pairs.find((candidate) => candidate.id === state.current);
  const replyPath = join(dir, "verdict.json");
  if (pair) {
    state.dispatches += 1;
    recordReply(state, pair, readReply(replyPath));
  }
  rmSync(replyPath, { force: true });
  queueNext(dir, state);
  return state.current === null;
}
