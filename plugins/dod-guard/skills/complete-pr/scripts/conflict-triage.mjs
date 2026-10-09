#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
import { createGitRunner, TriageStop } from "./lib/conflict-triage.mjs";
import { parseFlags, runCommand, USAGE, UsageError } from "./lib/conflict-triage-command.mjs";

const [command, ...rest] = process.argv.slice(2);
try {
  const result = await runCommand(command, createGitRunner(process.cwd()), parseFlags(rest));
  process.stdout.write(typeof result === "string" ? result : `${JSON.stringify(result, null, 2)}\n`);
  if (result?.ok === false) {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof UsageError || command === undefined) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
  } else if (error instanceof TriageStop) {
    process.stdout.write(`${JSON.stringify(error, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`conflict-triage failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
