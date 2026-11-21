// Checking what the apply session changed: anything outside the planned line
// ranges, any new file, and any manifest that no longer validates is reverted.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { readJson, writeJson } from "./claims.mjs";

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+/;

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function lines(text) {
  return text.split("\n").filter(Boolean);
}

export function changedFiles(repo) {
  return {
    tracked: lines(git(repo, ["diff", "--name-only"])),
    untracked: lines(git(repo, ["ls-files", "--others", "--exclude-standard"])),
  };
}

// The original-side line ranges a unified diff with no context touches. A
// pure insertion (count 0) touches the gap after its start line.
export function hunks(diff) {
  const ranges = [];
  for (const line of diff.split("\n")) {
    const match = HUNK.exec(line);
    if (match) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      ranges.push(count === 0 ? { start: start + 0.5, end: start + 0.5 } : { start, end: start + count - 1 });
    }
  }
  return ranges;
}

// Each target allows its own lines plus the gaps on either side of it, where
// a pure insertion lands.
function inside(range, target) {
  return range.start >= target.startLine - 0.5 && range.end <= target.endLine + 0.5;
}

function overlaps(range, target) {
  return range.start <= target.endLine + 0.5 && range.end >= target.startLine - 0.5;
}

// Adjacent or overlapping targets join into one span, because git reports
// edits to neighbouring lines as a single hunk. Fresh objects keep the plan's
// own targets unchanged.
function spans(targets) {
  const sorted = targets.map(({ startLine, endLine }) => ({ startLine, endLine }));
  sorted.sort((left, right) => left.startLine - right.startLine);
  const merged = [];
  for (const next of sorted) {
    const last = merged.at(-1);
    if (last && next.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, next.endLine);
      continue;
    }
    merged.push(next);
  }
  return merged;
}

export function rangesFit(ranges, targets) {
  const allowed = spans(targets);
  return ranges.every((range) => allowed.some((span) => inside(range, span)));
}

function revert(repo, file) {
  git(repo, ["checkout", "--", file]);
}

function validateManifests(repo, files) {
  const validator = join(repo, "scripts", "ci", "validate-plugins.mjs");
  if (existsSync(validator)) {
    const result = spawnSync(process.execPath, [validator], { cwd: repo, encoding: "utf8" });
    return result.status === 0 ? [] : files;
  }
  return files.filter((file) => {
    try {
      JSON.parse(readFileSync(join(repo, file), "utf8"));
      return false;
    } catch {
      return true;
    }
  });
}

function stray(repo, planned, reverted) {
  const { tracked, untracked } = changedFiles(repo);
  for (const file of tracked.filter((name) => !planned.has(name))) {
    revert(repo, file);
    reverted.push({ file, reason: "the plan names no claim in it" });
  }
  for (const file of untracked) {
    rmSync(join(repo, file), { force: true });
    reverted.push({ file, reason: "a new file the plan did not ask for" });
  }
}

function fileDiff(repo, file) {
  return hunks(git(repo, ["diff", "-U0", "--", file]));
}

function dropFile(repo, file, reason, log) {
  revert(repo, file);
  log.reverted.push({ file, reason });
  log.failed.set(file, reason);
}

export function verify({ dir, repo }) {
  const planPath = join(dir, "plan.json");
  const current = readJson(planPath);
  const planned = new Set(current.actions.map((entry) => entry.target.file));
  const log = { reverted: [], failed: new Map() };
  const { reverted, failed } = log;
  stray(repo, planned, reverted);
  for (const file of changedFiles(repo).tracked) {
    const targets = current.actions.filter((entry) => entry.target.file === file).map((entry) => entry.target);
    if (!rangesFit(fileDiff(repo, file), targets)) {
      dropFile(repo, file, "edit outside the named range", log);
    }
  }
  const manifests = changedFiles(repo).tracked.filter((file) => file.endsWith(".json"));
  for (const file of validateManifests(repo, manifests)) {
    dropFile(repo, file, "manifest validation failed", log);
  }
  const touched = new Map(changedFiles(repo).tracked.map((file) => [file, fileDiff(repo, file)]));
  const applied = [];
  for (const entry of current.actions) {
    const ranges = touched.get(entry.target.file) ?? [];
    if (ranges.some((range) => overlaps(range, entry.target))) {
      applied.push(entry);
      continue;
    }
    const reason = failed.get(entry.target.file) ?? "not applied";
    current.undecided.push({ id: entry.id, reason, detail: "", a: entry.target, b: entry.survivor, dates: null });
  }
  writeJson(planPath, { ...current, applied, reverted });
  return touched.size;
}
