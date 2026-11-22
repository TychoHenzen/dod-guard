// The artifact files and claim shapes every doc-reconcile step shares.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function statePath(dir) {
  return join(dir, "state.json");
}

export function claimOf(side) {
  return { file: side.file, startLine: side.startLine, endLine: side.endLine, heading: side.heading, text: side.text };
}

export function where(claim) {
  return `${claim.file}:${claim.startLine}-${claim.endLine}`;
}
