#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { buildConfig } from "./lib/config.mjs";
import {
  ExclusionConfigError,
  loadRepoConfig,
} from "./lib/exclusion-config.mjs";
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
  if (!options.noConfig) {
    try {
      const repo = loadRepoConfig(options.root);
      options.excludes.push(...repo.excludePaths);
      options.registeredAttributes.push(...repo.registeredAttributes);
    } catch (error) {
      if (!(error instanceof ExclusionConfigError)) throw error;
      process.stderr.write(`${error.message}\n`);
      return 3;
    }
  }
  const { registeredAttributes } = options;
  return run(options, buildConfig({ registeredAttributes }));
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
