// The slice queue: record the maintainer's answer, then after each session
// verify the slice it applied, commit or revert it, and queue the next.
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, list, readJson, statePath, writeJson } from "./common.mjs";
import { NONE } from "./form.mjs";
import { changedPaths, scan, verifySlice } from "./verify.mjs";

// More slices than this in one run are reported as not run.
export const MAX_SLICES = 10;

function queueNext(dir, state, repo) {
  const next = state.queue.find((id) => !(id in state.results));
  state.current = next ?? null;
  state.before = next ? scan(repo) : null;
  state.head = git(repo, ["rev-parse", "HEAD"]).trim();
  const currentPath = join(dir, "current.json");
  rmSync(currentPath, { force: true });
  if (next) {
    writeJson(
      currentPath,
      state.slices.find((slice) => slice.id === next),
    );
  }
  writeJson(statePath(dir), state);
}

export function approve(options) {
  const { slices, test, agentSource } = readJson(join(options.dir, "items.json"));
  const decisions = list(JSON.parse(options.answer)?.decisions);
  const picked = decisions.includes(NONE) ? new Set() : new Set(decisions);
  const chosen = slices.filter((slice) => picked.has(slice.id));
  const results = {};
  for (const slice of chosen.slice(MAX_SLICES)) {
    results[slice.id] = { status: "not run", reason: `a run applies at most ${MAX_SLICES} slices` };
  }
  const state = {
    slices,
    test,
    agentSource,
    queue: chosen.map((slice) => slice.id),
    results,
    current: null,
    before: null,
  };
  queueNext(options.dir, state, options.repo);
  return { count: String(chosen.length) };
}

function revertAll(repo, head) {
  git(repo, ["reset", "-q", "--hard", head]);
  git(repo, ["clean", "-fdq"]);
}

function commitSlice(slice, repo, dir) {
  if (changedPaths(repo).length === 0) {
    return { status: "failed", reason: "the session changed nothing" };
  }
  git(repo, ["add", "-A"]);
  const message = join(dir, "slice-message.txt");
  writeFileSync(
    message,
    `codex-migrate: ${slice.label}\n\n` +
      `Slice ${slice.id} (${slice.kind}), applied and verified by the dod-guard\ncodex-migrate workflow.\n`,
  );
  git(repo, ["commit", "-q", "-F", message]);
  return { status: "applied", commit: git(repo, ["rev-parse", "HEAD"]).trim() };
}

function sliceResult(slice, state, options) {
  try {
    const problem = verifySlice(slice, state, options.repo);
    return problem ? { status: "failed", reason: problem } : commitSlice(slice, options.repo, options.dir);
  } catch (error) {
    return { status: "failed", reason: error.message };
  }
}

// Returns true once every approved slice has a result.
export function advance(options) {
  const state = readJson(statePath(options.dir));
  const slice = state.slices.find((candidate) => candidate.id === state.current);
  if (slice) {
    const result = sliceResult(slice, state, options);
    if (result.status !== "applied") {
      revertAll(options.repo, state.head);
    }
    state.results[slice.id] = result;
  }
  queueNext(options.dir, state, options.repo);
  return state.current === null;
}
