/**
 * dod-guard CLI. The proof/predicate engine that used to back `check`,
 * `status`, `tree`, `list`, and `trace` is gone - see
 * openspec/changes/route-skills-through-openspec. `cover` is the
 * replacement surface.
 */
import { runCover } from "./cover/run.js";

const USAGE = `dod-guard - OpenSpec scenario coverage

USAGE
  dod-guard <command> [options]
  dod-guard                          Start the MCP server on stdio (no args)

COMMANDS
  cover [<change-id>] [--all]        Report each scenario as bound or unwired
      [--write-baseline]             against the coverage-gate ratchet baseline.
                                      One of <change-id> or --all is required.
                                      --write-baseline needs --all - it replaces
                                      the whole baseline, and a change-scoped run
                                      only sees its own scenarios.
                                      --cwd=<dir> overrides the working directory.

EXIT CODES
  0   no regressions
  1   a coverage regression
  3   usage error
  4   the change's tasks.md has an unexpanded group
  5   the change's plan is fully expanded but binds none of its scenarios
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

/** Not 1: a skill branching on the exit code would report an unexpanded plan as a regression. */
export const EXIT_PLAN_INCOMPLETE = 4;

/** Distinct from 4: the plan is fully expanded, it just implements none of the change's scenarios. */
export const EXIT_PLAN_UNBOUND = 5;

const COMMANDS: Record<string, Command> = {
  cover: (positional, flags, io) =>
    runCover(
      {
        cwd: typeof flags.cwd === "string" ? flags.cwd : process.cwd(),
        changeId: positional[0],
        all: flags.all === true,
        writeBaseline: flags["write-baseline"] === true,
      },
      io,
    ),
};

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
