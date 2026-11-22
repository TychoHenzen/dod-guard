// File helpers the skill-migrate steps share. A missing session file reads
// as empty text, so a gate can report what is absent rather than crash.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const MAX_BUFFER = 256 * 1024 * 1024;

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
