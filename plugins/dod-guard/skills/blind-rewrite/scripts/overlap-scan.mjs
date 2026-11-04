#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { readTextFile } from "../../../lib/read-text.mjs";
import { scoreOverlap } from "./overlap-metrics.mjs";

async function filesAt(path) {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.filter((entry) => !entry.name.startsWith(".")).map((entry) => filesAt(join(path, entry.name))),
  );
  return nested.flat();
}

async function readTree(path) {
  const files = await filesAt(path);
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

function parseArgs(argv) {
  const options = { mode: "code", whitelist: [] };
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) options[match[1]] = match[2];
  }
  options.whitelist = String(options.whitelist ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return options;
}

function loadContract(value) {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/^Verbatim\s*:\s*/i, ""));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!(options.original && options.rewrite)) {
    console.error("usage: overlap-scan.mjs --original=<path> --rewrite=<path> [--mode=code|prose]");
    process.exitCode = 2;
    return;
  }
  const [original, rewrite] = await Promise.all([readTree(options.original), readTree(options.rewrite)]);
  const metrics = scoreOverlap(original, rewrite, {
    mode: options.mode,
    whitelist: options.whitelist,
    contract: loadContract(options["contract-file"] ? readTextFile(options["contract-file"]) : ""),
  });
  console.log(
    JSON.stringify({
      original: relative(process.cwd(), options.original),
      rewrite: relative(process.cwd(), options.rewrite),
      mode: options.mode,
      ...metrics,
    }),
  );
  process.exitCode = metrics.pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
