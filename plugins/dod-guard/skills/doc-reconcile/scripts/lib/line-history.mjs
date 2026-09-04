// Dates a claim's line range by reading `git log -L`. That command follows a
// range of lines through renames. It returns every commit that touched the
// range, along with the actual diff hunks. `git blame` only reports the single
// most recent commit per line. It loses every commit before that one.
//
// See the SKILL.md example this module was built against. Blame dates line 92
// of clean-house/SKILL.md to a punctuation-only commit. `git log -L` still has
// the wording commit before it.
//
// classifyCommit() and effectiveDate() decide which of those commits changed
// the claim's meaning, versus only its formatting. Both use contentDigest()
// from claim-tokens.mjs. That function already normalizes away whitespace,
// wrapping, case, punctuation, list markers and heading levels. This module
// never reimplements that normalization. It only compares digests.

import { execFileSync } from "node:child_process";
import { contentDigest } from "./claim-tokens.mjs";

// ASCII unit separator (0x1f). A commit sha, ISO date, and subject line never
// contain a control character. It can't collide with real field content the
// way a comma or pipe might.
const SEP = "\x1f";
const LOG_FORMAT = `COMMIT${SEP}%H${SEP}%aI${SEP}%s`;
const COMMIT_LINE_RE = new RegExp(`^COMMIT${SEP}([0-9a-f]{40})${SEP}([^${SEP}]+)${SEP}(.*)$`);

function defaultRun(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });
}

// Lines git prints around each hunk that carry no claim content: the file
// header (`diff --git`, `index`, `---`, `+++`) and the `@@ ... @@` hunk marker.
// Check `---`/`+++` before the generic "-"/"+" content check below. Both
// start with the same character.
function isDiffHeaderLine(line) {
  return (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("@@")
  );
}

function addDiffLine(line, commit) {
  if (isDiffHeaderLine(line)) {
    return;
  }
  if (line.startsWith("-")) {
    commit.removed.push(line.slice(1));
  } else if (line.startsWith("+")) {
    commit.added.push(line.slice(1));
  }
}

function startCommit(match) {
  return { sha: match[1], authorTime: new Date(match[2]), summary: match[3], removed: [], added: [] };
}

function finalizeCommit(commit) {
  return {
    sha: commit.sha,
    authorTime: commit.authorTime,
    summary: commit.summary,
    removed: commit.removed.join("\n"),
    added: commit.added.join("\n"),
  };
}

function parseLogOutput(output) {
  const commits = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(COMMIT_LINE_RE);
    if (match) {
      current = startCommit(match);
      commits.push(current);
    } else if (current) {
      addDiffLine(line, current);
    }
  }
  return commits.map(finalizeCommit);
}

// `target` is `{ file, startLine, endLine }`. `run` takes a git argument list
// and returns the command output. Omit it to shell out to the real git binary.
// Returns commits newest first, matching `git log`'s default order.
export function lineHistory(target, run = defaultRun) {
  const { file, startLine, endLine } = target;
  const args = ["log", "-L", `${startLine},${endLine}:${file}`, `--format=${LOG_FORMAT}`];
  return parseLogOutput(run(args));
}

// "cosmetic" when the normalized content is unchanged, "substantive" when it
// differs. `before`/`after` are a commit's removed/added diff text.
export function classifyCommit(before, after) {
  return contentDigest(before) === contentDigest(after) ? "cosmetic" : "substantive";
}

function hasUncommittedChange(file, run) {
  const output = run(["diff", "--name-only", "--", file]);
  return output.split(/\r?\n/).some((line) => line.trim() === file);
}

function resolveDeps(deps) {
  return {
    run: deps.run ?? defaultRun,
    history: deps.history ?? lineHistory,
  };
}

function skippedEntry(commit) {
  return { sha: commit.sha, summary: commit.summary };
}

function emptyResult(verdict) {
  return { date: null, sha: null, summary: null, skipped: [], verdict };
}

// Walks a claim's commits newest first and returns the first one that changed
// its meaning. Falls back to the oldest commit when every commit touching the
// range was cosmetic - that is when the content actually arrived. `deps` is
// `{ run, history }`, both optional, so tests can stub either collaborator.
export function effectiveDate(target, deps = {}) {
  const { run, history } = resolveDeps(deps);
  if (hasUncommittedChange(target.file, run)) {
    return emptyResult("uncommitted");
  }

  const commits = history(target, run);
  if (commits.length === 0) {
    return emptyResult("unknown");
  }

  const skipped = [];
  for (const commit of commits) {
    if (classifyCommit(commit.removed, commit.added) === "substantive") {
      return { date: commit.authorTime, sha: commit.sha, summary: commit.summary, skipped, verdict: "dated" };
    }
    skipped.push(skippedEntry(commit));
  }

  const oldest = commits[commits.length - 1];
  skipped.pop();
  return { date: oldest.authorTime, sha: oldest.sha, summary: oldest.summary, skipped, verdict: "cosmetic-only" };
}
