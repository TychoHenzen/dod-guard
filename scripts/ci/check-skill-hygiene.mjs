#!/usr/bin/env node
// check-skill-hygiene — keep skills from re-implementing OpenSpec.
//
// The rules live in lib/skill-hygiene-rules.mjs. This file is the CLI.
//
// Usage: node scripts/ci/check-skill-hygiene.mjs [--rule=<name>] [--root=<dir>]
//
// With no --rule, every rule runs. --root exists so the test suite can point a
// rule at a fixture tree instead of the repository.
//
// Exit codes:
//   0  every selected rule passed
//   1  a rule failed
//   3  usage error, including an unknown rule name

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "./lib/skill-hygiene-rules.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const USAGE = "usage: check-skill-hygiene.mjs [--rule=<name>] [--root=<dir>]\n";

function parseArgs(argv) {
  const options = { only: null, root: REPO_ROOT };
  for (const arg of argv) {
    const rule = /^--rule=(.+)$/.exec(arg);
    if (rule) {
      options.only = rule[1];
      continue;
    }
    const dir = /^--root=(.+)$/.exec(arg);
    if (dir) {
      options.root = resolve(dir[1]);
      continue;
    }
    return { error: `unknown option: ${arg}\n${USAGE}` };
  }
  return options;
}

function main(argv) {
  const { only, root, error } = parseArgs(argv);
  if (error) {
    process.stderr.write(error);
    return 3;
  }
  if (only !== null && !Object.hasOwn(RULES, only)) {
    process.stderr.write(`unknown rule: ${only}\nknown rules: ${Object.keys(RULES).join(", ")}\n`);
    return 3;
  }

  const selected = only === null ? Object.keys(RULES) : [only];
  const failures = selected.flatMap((name) => RULES[name](root).map((message) => `  [${name}] ${message}`));

  if (failures.length === 0) {
    process.stdout.write(`skill hygiene OK — ${selected.length} rule(s) passed\n`);
    return 0;
  }
  process.stdout.write(`skill hygiene FAILED — ${failures.length} violation(s)\n\n`);
  for (const line of failures) process.stdout.write(`${line}\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
