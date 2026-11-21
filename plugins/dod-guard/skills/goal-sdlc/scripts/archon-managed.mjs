#!/usr/bin/env node
// Tell whether Archon's SDLC pack runs this repository's lifecycle.
// Usage: node archon-managed.mjs [--cwd=<checkout>]
// Exit 0: not managed. Exit 1: managed, so goal-sdlc and quick-pbi must stop.
// Exit 3: could not tell (no origin, offline); the JSON names the problem.
//
// The pack treats a repository as its own when the default branch holds its
// maintainer list, so this reads the same file at the same place.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const MAINTAINERS = ".archon/sdlc/policy/maintainers.json";
const SYMREF = /^ref: refs\/heads\/(\S+)\tHEAD$/m;
const OPTION = /^--cwd=(.+)$/;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function archonManaged({ cwd = process.cwd() } = {}) {
  let branch;
  try {
    const match = SYMREF.exec(git(cwd, ["ls-remote", "--symref", "origin", "HEAD"]));
    if (!match) {
      return { state: "unknown", problem: "origin reports no default branch" };
    }
    [, branch] = match;
    git(cwd, ["fetch", "-q", "origin", branch]);
  } catch (error) {
    return { state: "unknown", problem: `cannot read origin: ${String(error.stderr || error.message).trim()}` };
  }
  try {
    git(cwd, ["cat-file", "-e", `FETCH_HEAD:${MAINTAINERS}`]);
    return { state: "managed", branch, file: MAINTAINERS };
  } catch {
    return { state: "unmanaged", branch };
  }
}

const EXIT = { unmanaged: 0, managed: 1, unknown: 3 };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = {};
  for (const arg of process.argv.slice(2)) {
    const match = OPTION.exec(arg);
    if (!match) {
      process.stderr.write(`archon-managed: unknown argument: ${arg}\n`);
      process.exit(2);
    }
    options.cwd = match[1];
  }
  const result = archonManaged(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(EXIT[result.state]);
}
