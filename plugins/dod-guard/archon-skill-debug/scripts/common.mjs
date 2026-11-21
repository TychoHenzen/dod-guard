// Helpers every skill-debug step shares: JSON artifacts, git and node calls
// that fail loudly, and the rules for naming a skill and a path it may edit.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

export const NONE = "none";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

export function node(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

export function bareName(skill) {
  return String(skill).replace(/^\//, "").split(":").pop();
}

// An installed plugin copy is never a file the workflow edits.
export function forbidden(path) {
  return /(^|\/)\.claude\/plugins\//.test(path);
}
