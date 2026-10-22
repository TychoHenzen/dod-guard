#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { fileURLToPath } from "node:url";
import { startCommand } from "./lib/detached-launch.mjs";
import { runSupervised } from "./lib/detached-supervise.mjs";
import { parseWaitSeconds, waitForCommand } from "./lib/detached-wait.mjs";

// ASSUMPTION: Medium risk. The launcher re-runs this same file as the detached
// supervisor (`__run`), which is the only way to keep one process that owns the
// command's exit code without a long-lived parent.
const SELF = fileURLToPath(import.meta.url);
const EXIT_USAGE = 2;

function usage() {
  process.stderr.write(
    [
      "Usage: node run-detached.mjs start <state-dir> -- <command> [args...]",
      "       node run-detached.mjs wait <state-dir> [--seconds N]\n",
    ].join("\n"),
  );
  process.exitCode = EXIT_USAGE;
}

// Returns the command after `--` when the args are `<state-dir> -- <command...>`.
function commandAfterSeparator(args) {
  if (args.indexOf("--") !== 1 || args.length <= 2) {
    return null;
  }
  return args.slice(2);
}

function start(args) {
  const command = commandAfterSeparator(args);
  if (!command) {
    usage();
    return;
  }
  startCommand(SELF, args[0], command);
}

function supervise(args) {
  const command = commandAfterSeparator(args);
  if (!command) {
    usage();
    return;
  }
  runSupervised(args[0], command);
}

async function wait(args) {
  if (args.length === 0) {
    usage();
    return;
  }
  await waitForCommand(args[0], parseWaitSeconds(args));
}

const MODES = { start, wait, __run: supervise };

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (!Object.hasOwn(MODES, mode)) {
    usage();
    return;
  }
  await MODES[mode](args);
}

await main();
