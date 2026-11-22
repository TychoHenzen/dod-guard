// Helpers every codex-migrate step shares: JSON files in the artifacts
// directory, string lists read from a session's JSON, and child processes.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Agent TOML the converter writes; nothing else may edit it.
export const GENERATED = ".codex/agents";

// True when a repository-relative path is dir itself or lies beneath it.
// Every path-against-entry comparison goes through here, so a slice entry
// may name a file or a directory.
// ASSUMPTION: dir may arrive with one trailing slash (agentSource is taken
// from the proposal session as written), so that slash is ignored.
export function atOrUnder(path, dir) {
  const base = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  return path === base || path.startsWith(`${base}/`);
}

export function underAny(path, entries) {
  return entries.some((entry) => atOrUnder(path, entry));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function statePath(dir) {
  return join(dir, "state.json");
}

export function list(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry !== "") : [];
}

export function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

export function git(repo, args) {
  const result = run("git", args, repo);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}
