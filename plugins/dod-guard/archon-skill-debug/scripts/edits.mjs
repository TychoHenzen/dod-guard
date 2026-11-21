// The approve and advance steps: queue the accepted findings, then verify each
// session's edit touched only the finding's file, and commit it or revert it.
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, NONE, readJson, writeJson } from "./common.mjs";

export function statePath(dir) {
  return join(dir, "state.json");
}

function queueNext(dir, repo, state) {
  const next = state.queue.find((id) => !(id in state.results));
  state.current = next ?? null;
  state.head = git(repo, ["rev-parse", "HEAD"]).trim();
  const currentPath = join(dir, "current.json");
  rmSync(currentPath, { force: true });
  if (next) {
    writeJson(
      currentPath,
      state.findings.find((finding) => finding.id === next),
    );
  }
  writeJson(statePath(dir), state);
}

export function approve({ dir, repo, answer }) {
  const { findings } = readJson(join(dir, "items.json"));
  const decisions = JSON.parse(answer)?.decisions;
  const picked = Array.isArray(decisions) && !decisions.includes(NONE) ? new Set(decisions) : new Set();
  const queue = findings.filter((finding) => picked.has(finding.id)).map((finding) => finding.id);
  queueNext(dir, repo, { findings, queue, results: {}, current: null, head: "" });
  return { count: String(queue.length) };
}

function changed(repo) {
  const fields = git(repo, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]).split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    paths.push(fields[index].slice(3));
    if (fields[index][0] === "R" || fields[index][0] === "C") {
      index += 1;
      paths.push(fields[index]);
    }
  }
  return paths;
}

function verify(finding, repo, state) {
  if (git(repo, ["rev-parse", "HEAD"]).trim() !== state.head) {
    return "the session made a commit; the workflow commits each edit itself";
  }
  const paths = changed(repo);
  if (paths.length === 0) {
    return "the session changed nothing";
  }
  const outside = paths.filter((path) => path !== finding.file);
  if (outside.length > 0) {
    return `changed files besides ${finding.file}: ${outside.join(", ")}`;
  }
  return existsSync(join(repo, finding.file)) ? null : `the session deleted ${finding.file}`;
}

function commitEdit(dir, repo, finding) {
  git(repo, ["add", "--", finding.file]);
  const message = join(dir, "edit-message.txt");
  writeFileSync(
    message,
    `skill-debug: ${finding.title}\n\nCause: ${finding.cause}. Accepted in the dod-guard skill-debug workflow.\n`,
  );
  git(repo, ["commit", "-q", "-F", message]);
  return { status: "applied", commit: git(repo, ["rev-parse", "HEAD"]).trim() };
}

function applyEdit(dir, repo, finding, state) {
  try {
    const problem = verify(finding, repo, state);
    return problem ? { status: "failed", reason: problem } : commitEdit(dir, repo, finding);
  } catch (error) {
    return { status: "failed", reason: error.message };
  }
}

// Returns true once every accepted finding has a result.
export function advance({ dir, repo }) {
  const state = readJson(statePath(dir));
  const finding = state.findings.find((candidate) => candidate.id === state.current);
  if (finding) {
    const result = applyEdit(dir, repo, finding, state);
    if (result.status !== "applied") {
      git(repo, ["reset", "-q", "--hard", state.head]);
      git(repo, ["clean", "-fdq"]);
    }
    state.results[finding.id] = result;
  }
  queueNext(dir, repo, state);
  return state.current === null;
}
