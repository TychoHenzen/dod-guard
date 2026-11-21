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

const MAX_BUFFER = 1 << 28;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, maxBuffer: MAX_BUFFER });
}

export function materialize({ commit, target, dir, cwd = process.cwd() }) {
  const listing = git(cwd, ["ls-tree", "-r", "-z", "--full-tree", commit, "--", target]);
  let written = 0;
  for (const entry of listing.toString("utf8").split("\0")) {
    if (entry === "") continue;
    const tab = entry.indexOf("\t");
    const type = entry.slice(0, tab).split(" ")[1];
    // A submodule entry is a commit with no content in this repository.
    if (type !== "blob") continue;
    const sha = entry.slice(0, tab).split(" ")[2];
    const out = join(dir, entry.slice(tab + 1));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, git(cwd, ["cat-file", "blob", sha]));
    written += 1;
  }
  if (written === 0) throw new Error(`no tracked file at ${target} in ${commit}`);
  return written;
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--(commit|target|dir)=(.+)$/.exec(arg);
    if (!match) throw new Error(`unknown argument: ${arg}`);
    options[match[1]] = match[2];
  }
  for (const name of ["commit", "target", "dir"]) {
    if (!options[name]) throw new Error(`missing --${name}`);
  }
  return options;
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
