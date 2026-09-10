#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { buildConfig } from "./lib/config.mjs";
import { USAGE, parseArgs, validate } from "./quality-scan-options.mjs";
import { run } from "./quality-scan-run.mjs";

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const problem = options.error ?? validate(options);
  if (problem) {
    process.stderr.write(`${problem}\n\n${USAGE}\n`);
    return 3;
  }
  return run(options, buildConfig(options.profile));
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
