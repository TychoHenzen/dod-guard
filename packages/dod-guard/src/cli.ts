import { formatCheckResult, updateDocFromCheckResult, writeMarkdown } from "./author.js";
import { checkDocument, findNodeByPath } from "./checker.js";
import { buildImportGateInfo } from "./import-gate.js";
import { fetchInstructions } from "./openspec/fetch-instructions.js";
import { classifyOutcome, formatTraceReport, traceChange } from "./openspec/trace.js";
import * as store from "./store.js";
import { formatTree } from "./tree-utils.js";
import type { CheckResult, DodDocument } from "./types.js";

/**
 * Exit codes — these are the contract for `verify_cmd` / `fitness_cmd` callers
 * (evomcp solve, cheap-step, cascade). Keep them stable.
 */
export const EXIT = {
  /** All in-scope proofs passed. */
  PASS: 0,
  /** At least one in-scope proof failed, or the DoD is tampered/stuck. */
  FAIL: 1,
  /** Full run: every executed proof passed but draft nodes remain unrefined. */
  INCOMPLETE: 2,
  /** Usage error, DoD not found, or execution blocked by the import gate. */
  ERROR: 3,
} as const;

const USAGE = `dod-guard — Definition of Done verification

USAGE
  dod-guard <command> [options]
  dod-guard                          Start the MCP server on stdio (no args)

COMMANDS
  check     Run a DoD's proofs and exit with a verdict code
  status    Print the last cached check result without re-running proofs
  tree      Print the DoD's node tree with paths (use to find --node-path values)
  list      List all tracked DoDs
  trace     Check OpenSpec closure for a change: leaf <-> scenario, both directions

OPTIONS (check / status / tree)
  --dod-id=<id>        DoD ID, as returned by dod_create or 'dod-guard list'
  --path=<file>        Resolve the DoD by its markdown path instead of by ID
  --node-path=<path>   Scope to one subtree, e.g. --node-path=0.children.1
  --cwd=<dir>          Override the working directory proofs run in (check only)
  --summary            Collapse unchanged draft nodes into a count line
  --confirm-import     Confirm an imported DoD's commands are safe to execute
  --quiet              Print only the verdict line; suppress per-proof output

OPTIONS (trace)
  --cwd=<dir>          Directory 'openspec instructions' resolves the change from (default: cwd)

EXIT CODES (check)
  0  pass         every in-scope proof passed
  1  fail         a proof failed, or the DoD is tampered/stuck
  2  incomplete   full run, proofs pass, but draft nodes remain
  3  error        bad usage, DoD not found, or import gate blocked

A scoped run (--node-path) exits 0 when that subtree's proofs pass, which is what
makes it usable as a verify_cmd. Only an unscoped run can report code 2.

EXIT CODES (trace)
  0  pass    every DoD leaf traces to a scenario (untraced scenarios are only reported)
  1  fail    at least one DoD leaf traces to no scenario
  3  error   bad usage, or this change has no DoD in storage or on disk

EXAMPLES
  dod-guard check --dod-id=abc123
  dod-guard check --dod-id=abc123 --node-path=0.children.1 --quiet
  dod-guard check --path=docs/plans/2026-07-27-auth.md --cwd=/repo
  dod-guard trace adopt-openspec-for-dod-proofs
  dod-guard tree --dod-id=abc123
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

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Resolve a DoD by --dod-id or --path. Writes its own error on failure. */
async function resolveDoc(flags: Flags, write: (s: string) => void): Promise<DodDocument | null> {
  const dodId = str(flags, "dod-id");
  const mdPath = str(flags, "path");

  if (!(dodId || mdPath)) {
    write("ERROR: pass --dod-id=<id> or --path=<file>. Run 'dod-guard list' to see tracked DoDs.\n");
    return null;
  }

  const doc = dodId ? await store.load(dodId) : await store.findByPath(mdPath as string);

  if (!doc) {
    write(
      dodId
        ? `ERROR: DoD ID "${dodId}" not found in the store. Run 'dod-guard list' to see tracked DoDs.\n`
        : `ERROR: no DoD registered for path "${mdPath}". Use dod_import to register an existing file.\n`,
    );
    return null;
  }

  return doc;
}

/**
 * Map a check verdict to an exit code.
 *
 * Scoped runs always carry overall "incomplete" (checker.ts forces it so a
 * subtree can never be mistaken for whole-DoD completion), so the exit code for
 * a scoped run is derived from the leaves that actually ran, not from `overall`.
 */
export function exitCodeFor(result: CheckResult): number {
  if (result.tampered || result.overall === "stuck" || result.overall === "fail") return EXIT.FAIL;

  if (result.scoped) {
    return result.leaves.some((l) => l.status === "fail") ? EXIT.FAIL : EXIT.PASS;
  }

  if (result.overall === "incomplete") return EXIT.INCOMPLETE;
  return EXIT.PASS;
}

async function cmdCheck(flags: Flags, write: (s: string) => void, writeErr: (s: string) => void): Promise<number> {
  const doc = await resolveDoc(flags, writeErr);
  if (!doc) return EXIT.ERROR;

  const nodePath = str(flags, "node-path");
  if (nodePath && !findNodeByPath(doc.roots, nodePath)) {
    writeErr(
      `ERROR: node path "${nodePath}" not found in this DoD. Run 'dod-guard tree --dod-id=${doc.id}' to see valid paths.\n`,
    );
    return EXIT.ERROR;
  }

  const gate = buildImportGateInfo(doc);
  if (gate.blocked && flags["confirm-import"] !== true) {
    writeErr(
      [
        `ERROR: import gate — this DoD was imported from "${doc.import_source}" and is not confirmed for execution.`,
        `${gate.executableCount} proof command(s) would run. Review them with 'dod-guard tree --dod-id=${doc.id}',`,
        "then re-run with --confirm-import once you are satisfied they are safe.",
        "",
      ].join("\n"),
    );
    return EXIT.ERROR;
  }

  if (flags["confirm-import"] === true && doc.import_source) {
    doc.execution_confirmed = true;
    await store.save(doc);
    await writeMarkdown(doc);
  }

  const result = await checkDocument(doc, str(flags, "cwd"), {
    nodePath,
    summary: flags.summary === true,
  });

  if (!doc.proof_fingerprint && result.proof_fingerprint) {
    doc.proof_fingerprint = result.proof_fingerprint;
  }

  updateDocFromCheckResult(doc, result);
  await store.save(doc);
  await writeMarkdown(doc);

  if (flags.quiet === true) {
    write(`${result.overall.toUpperCase()}: ${result.summary.split("\n")[0]}\n`);
  } else {
    write(`${formatCheckResult(result)}\n`);
  }

  return exitCodeFor(result);
}

async function cmdStatus(flags: Flags, write: (s: string) => void, writeErr: (s: string) => void): Promise<number> {
  const doc = await resolveDoc(flags, writeErr);
  if (!doc) return EXIT.ERROR;

  if (!doc.last_check) {
    write("No cached check result. Run 'dod-guard check' first.\n");
    return EXIT.INCOMPLETE;
  }

  const { overall, summary, timestamp } = doc.last_check;
  write(`${overall.toUpperCase()} (cached ${timestamp})\n${summary}\n`);

  // The cached record keeps only the verdict, not per-leaf results, so map the
  // verdict directly. A cached scoped run is indistinguishable from an
  // unscoped one here — 'status' is for humans; use 'check' for a gate.
  if (overall === "fail" || overall === "stuck") return EXIT.FAIL;
  if (overall === "incomplete") return EXIT.INCOMPLETE;
  return EXIT.PASS;
}

async function cmdTree(flags: Flags, write: (s: string) => void, writeErr: (s: string) => void): Promise<number> {
  const doc = await resolveDoc(flags, writeErr);
  if (!doc) return EXIT.ERROR;

  write(`${formatTree(doc.roots)}\n`);
  return EXIT.PASS;
}

/** Maps `classifyOutcome` to the exit code contract - see EXIT CODES (trace) in USAGE. */
function traceExitCodeFor(outcome: ReturnType<typeof classifyOutcome>): number {
  if (outcome === "no-dod") return EXIT.ERROR;
  if (outcome === "blocked") return EXIT.FAIL;
  return EXIT.PASS;
}

/** Resolves the change's instructions, or writes the error and returns null. */
async function resolveInstructions(
  changeId: string,
  cwd: string,
  writeErr: (s: string) => void,
): Promise<Awaited<ReturnType<typeof fetchInstructions>> | null> {
  try {
    return await fetchInstructions(changeId, cwd);
  } catch (err) {
    writeErr(`ERROR: ${errorMessage(err)}\n`);
    return null;
  }
}

/** Runs the closure check once `instructions` is in hand, and writes the report. */
async function reportTrace(
  changeId: string,
  instructions: Awaited<ReturnType<typeof fetchInstructions>>,
  write: (s: string) => void,
  writeErr: (s: string) => void,
): Promise<number> {
  const report = await traceChange(changeId, instructions);
  const outcome = classifyOutcome(report);
  const text = formatTraceReport(report);
  if (outcome === "no-dod") {
    writeErr(text);
    return traceExitCodeFor(outcome);
  }
  write(text);
  return traceExitCodeFor(outcome);
}

async function cmdTrace(
  positional: string[],
  flags: Flags,
  write: (s: string) => void,
  writeErr: (s: string) => void,
): Promise<number> {
  const changeId = positional[0];
  if (!changeId) {
    writeErr("ERROR: pass a change id, e.g. 'dod-guard trace adopt-openspec-for-dod-proofs'.\n");
    return EXIT.ERROR;
  }

  const cwd = str(flags, "cwd") ?? process.cwd();
  const instructions = await resolveInstructions(changeId, cwd, writeErr);
  if (!instructions) return EXIT.ERROR;

  return reportTrace(changeId, instructions, write, writeErr);
}

async function cmdList(write: (s: string) => void): Promise<number> {
  const docs = await store.listAll();

  if (docs.length === 0) {
    write("No DoDs tracked. Create one with dod_create, or register an existing file with dod_import.\n");
    return EXIT.PASS;
  }

  for (const doc of docs) {
    const verdict = doc.last_check?.overall ?? "unchecked";
    write(`${doc.id}  ${verdict.padEnd(11)}  ${doc.title}\n`);
  }

  return EXIT.PASS;
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

const COMMANDS: Record<string, Command> = {
  check: (_p, flags, io) => cmdCheck(flags, io.write, io.writeErr),
  status: (_p, flags, io) => cmdStatus(flags, io.write, io.writeErr),
  tree: (_p, flags, io) => cmdTree(flags, io.write, io.writeErr),
  trace: (positional, flags, io) => cmdTrace(positional, flags, io.write, io.writeErr),
  list: (_p, _f, io) => cmdList(io.write),
};

/** Run the CLI. Returns the process exit code — never calls process.exit itself. */
export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const { command, flags, positional } = parseArgs(argv);

  if (flags.help === true || flags.h === true || command === "help") {
    io.write(USAGE);
    return EXIT.PASS;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    io.writeErr(`ERROR: unknown command "${command}".\n\n`);
    io.writeErr(USAGE);
    return EXIT.ERROR;
  }

  try {
    return await handler(positional, flags, io);
  } catch (err) {
    io.writeErr(`ERROR: ${errorMessage(err)}\n`);
    return EXIT.ERROR;
  }
}

/** True when argv looks like a CLI invocation rather than an MCP stdio launch. */
export function isCliInvocation(argv: string[]): boolean {
  return argv.length > 0;
}
