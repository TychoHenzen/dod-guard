#!/usr/bin/env node
// Write dod-guard's standards into a repository's Archon SDLC sidecar files.
// Usage: node install.mjs --source=<standards dir> --repo=<checkout root>
// Prints one JSON array of {path, action}; exit 0 on success, 2 on any error.
//
// Each file gets one marked block. A rerun replaces the block and leaves every
// line outside it alone, so a project's own policy lines survive an update.
// Every target is checked before any file is written, so a malformed target
// leaves the whole repository unchanged.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const BEGIN = "<!-- dod-guard:sdlc-standards begin -->";
export const END = "<!-- dod-guard:sdlc-standards end -->";
const OPTION = /^--(source|repo)=(.+)$/;
const CRLF = /\r\n/;
const LF = /\n/g;

function count(text, marker) {
  return text.split(marker).length - 1;
}

// The pack reads an engineering.md at the root before one under .archon/, so
// an existing root file takes the block rather than gaining a rival.
function engineeringTarget(repo) {
  return existsSync(join(repo, "engineering.md")) ? "engineering.md" : ".archon/engineering.md";
}

function plan(source, repo) {
  const pairs = [{ from: join(source, "engineering.md"), to: engineeringTarget(repo) }];
  const policyDir = join(source, "policy");
  for (const name of readdirSync(policyDir)
    .filter((file) => file.endsWith(".md"))
    .sort()) {
    pairs.push({ from: join(policyDir, name), to: `.archon/sdlc/policy/${name}` });
  }
  return pairs;
}

// One blank line between the project's own text and an appended block.
function separatorBefore(existing, eol) {
  if (existing === "" || existing.endsWith(eol + eol)) {
    return "";
  }
  return existing.endsWith(eol) ? eol : eol + eol;
}

export function merge(existing, body) {
  const block = `${BEGIN}\n${body.trimEnd()}\n${END}\n`;
  if (existing === null) {
    return block;
  }
  const eol = CRLF.test(existing) ? "\r\n" : "\n";
  const wanted = eol === "\n" ? block : block.replace(LF, eol);
  const begins = count(existing, BEGIN);
  const ends = count(existing, END);
  if (begins === 0 && ends === 0) {
    return existing + separatorBefore(existing, eol) + wanted;
  }
  const start = existing.indexOf(BEGIN);
  const stop = existing.indexOf(END);
  if (begins !== 1 || ends !== 1 || stop < start) {
    throw new Error("the dod-guard markers are damaged: expected one begin marker followed by one end marker");
  }
  let after = stop + END.length;
  if (existing.startsWith(eol, after)) {
    after += eol.length;
  }
  return existing.slice(0, start) + wanted + existing.slice(after);
}

export function install({ source, repo }) {
  const writes = plan(source, repo).map(({ from, to }) => {
    const path = join(repo, to);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
    try {
      return { to, path, existing, next: merge(existing, readFileSync(from, "utf8")) };
    } catch (error) {
      throw new Error(`${to}: ${error.message}`);
    }
  });
  return writes.map(({ to, path, existing, next }) => {
    if (existing === next) {
      return { path: to, action: "unchanged" };
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
    return { path: to, action: existing === null ? "created" : "updated" };
  });
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
  for (const name of ["source", "repo"]) {
    if (!options[name]) {
      throw new Error(`missing --${name}`);
    }
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(install(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`install: ${error.message}\n`);
    process.exit(2);
  }
}
