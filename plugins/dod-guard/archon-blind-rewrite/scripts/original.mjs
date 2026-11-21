#!/usr/bin/env node
// Copy the tracked files of one path at one commit into a folder, byte for byte.
// Usage: node original.mjs --commit=<sha> --target=<repo path> --dir=<folder>
// Exit 0 when at least one file was written, 2 on any error.
//
// git archive is not used: it applies export-ignore and export-subst, so it can
// drop files or rewrite their contents and still exit 0.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_BUFFER = 256 * 1024 * 1024;
const OPTION = /^--(commit|target|dir)=(.+)$/;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, maxBuffer: MAX_BUFFER });
}

// One `git ls-tree -z` entry is "<mode> <type> <sha>\t<path>".
function parseEntry(entry) {
  const tab = entry.indexOf("\t");
  const [, type, sha] = entry.slice(0, tab).split(" ");
  return { type, sha, path: entry.slice(tab + 1) };
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = OPTION.exec(arg);
    if (!match) {
      throw new Error(`unknown argument: ${arg}`);
    }
    options[match[1]] = match[2];
  }
  for (const name of ["commit", "target", "dir"]) {
    if (!options[name]) {
      throw new Error(`missing --${name}`);
    }
  }
  return options;
}

export function materialize({ commit, target, dir, cwd = process.cwd() }) {
  const listing = git(cwd, ["ls-tree", "-r", "-z", "--full-tree", commit, "--", target]);
  // A submodule entry is a commit with no content in this repository.
  const blobs = listing
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry !== "")
    .map(parseEntry)
    .filter((entry) => entry.type === "blob");
  if (blobs.length === 0) {
    throw new Error(`no tracked file at ${target} in ${commit}`);
  }
  for (const { sha, path } of blobs) {
    const out = join(dir, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, git(cwd, ["cat-file", "blob", sha]));
  }
  return blobs.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const written = materialize(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${written}\n`);
  } catch (error) {
    process.stderr.write(`original: ${error.message}\n`);
    process.exit(2);
  }
}
