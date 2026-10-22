// The command-line surface of conflict-triage.mjs: usage text and flag parsing.
export const USAGE = `Usage: node conflict-triage.mjs <command> --state <file> [options]
  start   --state <file> --repository <owner/repository> --pull <number> --trusted-head <sha>
          --generators <file>
  verify  --state <file> --decisions <file>
  regen-check --state <file> [--expect-clean]
  commit  --state <file> (--message <text> | --amend)
  push    --state <file>
  abort   --state <file>
  record  --state <file> [--decisions <file>] [--answers <file>] [--verification <file>] [--merge <sha>]
          [--stop <file>]
The state file and every input file live outside the repository.
`;

export class UsageError extends Error {}

const BOOLEAN_FLAGS = new Set(["--amend", "--expect-clean"]);

export function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) {
      throw new UsageError(`Unexpected argument: ${name}`);
    }
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name.slice(2)] = true;
      continue;
    }
    if (index + 1 >= argv.length) {
      throw new UsageError(`Missing value for ${name}`);
    }
    flags[name.slice(2)] = argv[index + 1];
    index += 1;
  }
  return flags;
}
