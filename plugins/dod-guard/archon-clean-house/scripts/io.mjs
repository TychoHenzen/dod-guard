// File and git helpers the clean-house steps share.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Reads a JSON file, or returns `fallback` when the file does not exist.
export function readJsonOr(path, fallback) {
  return existsSync(path) ? readJson(path) : fallback;
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

export function tracked(repo, path) {
  return spawnSync("git", ["ls-files", "--error-unmatch", "--", path], { cwd: repo }).status === 0;
}

// The non-empty strings of `value`, or nothing when it is not an array.
export function list(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry !== "") : [];
}
