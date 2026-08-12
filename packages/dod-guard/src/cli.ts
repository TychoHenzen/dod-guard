/**
 * dod-guard CLI. The proof/predicate engine that used to back `check`,
 * `status`, `tree`, `list`, and `trace` is gone - see
 * openspec/changes/route-skills-through-openspec. `steps` (task-bound) and
 * `cover` (scenario-to-test coverage) land in later steps of that change.
 */
const USAGE = `dod-guard - OpenSpec scenario coverage

USAGE
  dod-guard <command> [options]
  dod-guard                          Start the MCP server on stdio (no args)

COMMANDS
  (none shipped yet - steps and cover land in a follow-up commit)
`;

type Flags = Record<string, string | boolean>;

/** Parse `--key=value`, `--flag`, and bare positional args. */
export function parseArgs(argv: string[]): { command: string; flags: Flags; positional: string[] } {
  const flags: Flags = {};
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq === -1) flags[body] = true;
      else flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      positional.push(arg);
    }
  }

  return { command: positional[0] ?? "", flags, positional: positional.slice(1) };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface CliIo {
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

const defaultIo: CliIo = {
  write: (s) => process.stdout.write(s),
  writeErr: (s) => process.stderr.write(s),
};

type Command = (positional: string[], flags: Flags, io: CliIo) => Promise<number>;

/** Usage error exit code, matching the retired EXIT.ERROR contract. */
export const EXIT_USAGE_ERROR = 3;

const COMMANDS: Record<string, Command> = {};

/** Run the CLI. Returns the process exit code. Never calls process.exit itself. */
export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const { command, flags, positional } = parseArgs(argv);

  if (flags.help === true || flags.h === true || command === "help") {
    io.write(USAGE);
    return 0;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    io.writeErr(`ERROR: unknown command "${command}".\n\n`);
    io.writeErr(USAGE);
    return EXIT_USAGE_ERROR;
  }

  try {
    return await handler(positional, flags, io);
  } catch (err) {
    io.writeErr(`ERROR: ${errorMessage(err)}\n`);
    return EXIT_USAGE_ERROR;
  }
}

/** True when argv looks like a CLI invocation rather than an MCP stdio launch. */
export function isCliInvocation(argv: string[]): boolean {
  return argv.length > 0;
}
