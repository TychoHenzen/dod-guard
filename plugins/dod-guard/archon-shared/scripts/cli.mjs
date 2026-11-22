// The command-line shell every archon-* workflow script shares: parse
// `<command> --name=value...`, run the named command, print its output, and
// exit 2 with the script's name on any error.
//
// A command returns the text to print, or { out, code } when its exit code
// carries the verdict (an empty out prints nothing).
import process from "node:process";
import { pathToFileURL } from "node:url";

const OPTION = /^--([\w-]+)=(.*)$/s;

export function parseArgs(argv, required = []) {
  const [command, ...rest] = argv;
  const parsed = { command };
  for (const arg of rest) {
    const match = OPTION.exec(arg);
    if (!match) {
      throw new Error(`unknown argument: ${arg}`);
    }
    parsed[match[1]] = match[2];
  }
  for (const name of required) {
    if (!parsed[name]) {
      throw new Error(`missing --${name}`);
    }
  }
  return parsed;
}

function invoke(commands, args) {
  const command = Object.hasOwn(commands, args.command) ? commands[args.command] : undefined;
  if (!command) {
    throw new Error(`unknown command: ${args.command}`);
  }
  const result = command(args);
  return typeof result === "string" ? { out: result, code: 0 } : result;
}

// Runs the CLI when `url` (the caller's import.meta.url) is the entry script,
// and does nothing when the module is only imported.
export function runCli({ url, name, commands, required = [] }) {
  if (!process.argv[1] || url !== pathToFileURL(process.argv[1]).href) {
    return;
  }
  try {
    const { out, code } = invoke(commands, parseArgs(process.argv.slice(2), required));
    if (out !== "") {
      process.stdout.write(`${out}\n`);
    }
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`${name}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
