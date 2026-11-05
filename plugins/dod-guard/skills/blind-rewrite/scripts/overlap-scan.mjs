#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { readTextFile } from "../../../lib/read-text.mjs";
import { optionError, parseArgs } from "./overlap-args.mjs";
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

function loadContract(value) {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/^Verbatim\s*:\s*/i, ""));
}

async function readInputs(options) {
  const [original, rewrite] = await Promise.all([readTree(options.original), readTree(options.rewrite)]);
  const contractPath = options["contract-file"];
  return { original, rewrite, contractText: contractPath ? readTextFile(contractPath) : "" };
}

// Prints the score as JSON and returns the exit code: 0 on pass, 1 on fail.
function printScore(options, inputs) {
  const metrics = scoreOverlap(inputs.original, inputs.rewrite, {
    mode: options.mode,
    whitelist: options.whitelist,
    contract: loadContract(inputs.contractText),
  });
  console.log(
    JSON.stringify({
      original: relative(process.cwd(), options.original),
      rewrite: relative(process.cwd(), options.rewrite),
      mode: options.mode,
      ...metrics,
    }),
  );
  return metrics.pass ? 0 : 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const problem = optionError(options);
  if (problem) {
    console.error(problem);
    process.exitCode = 2;
    return;
  }
  let inputs;
  try {
    inputs = await readInputs(options);
  } catch (error) {
    console.error(`overlap-scan: cannot read an input: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  process.exitCode = printScore(options, inputs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
