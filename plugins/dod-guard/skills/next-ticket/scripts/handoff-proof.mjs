#!/usr/bin/env node
// Runs the structured-handoff convergence proof over an issue body.
//
// Usage: node handoff-proof.mjs refinement --body-file=<path> [--children=<path>]
//        node handoff-proof.mjs post-push --body-file=<path> --handoff-file=<path>
//          --head-sha=<sha> [--children=<path>]
//        node handoff-proof.mjs finalization --body-file=<path> --handoff-file=<path>
//          --head-sha=<sha> [--children=<path>]
//
// refinement reads the records of a body saved to a local file, plus the
// linked functional-slice children from an optional JSON array file, and runs
// the pre-push proof, including the lens-row rules on the planned acceptance
// matrix. post-push reads the same body and the acceptance matrix of the
// implementation handoff saved to a local file, and checks every row and every
// review lens against the pushed head SHA, so a row or lens bound to another
// head is reported. finalization is the same proof plus the complete-pr gate's
// own head check; complete-pr runs it before it readies or merges. No subcommand
// makes a network or GitHub call; fetching the issue and the handoff belongs to
// the caller. Each prints one JSON object
// {outcome, remainder} and exits:
//   0  verified
//   1  actionable remainder
//   2  usage or parse error (a handoff with no readable matrix is a parse error)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { parseIssueBodyRecords, postPushInput } from "../../../lib/issue-body-records.mjs";
import { evaluateStructuredFinalization } from "../../complete-pr/scripts/finalization-gate.mjs";
import { evaluateConvergence } from "./structured-workflow-proof.mjs";

const EXIT_CODES = Object.freeze({ verified: 0, "actionable remainder": 1 });
const POST_PUSH_OPTIONS = new Set(["body-file", "children", "handoff-file", "head-sha"]);
const SUBCOMMANDS = Object.freeze({
  refinement: new Set(["body-file", "children"]),
  "post-push": POST_PUSH_OPTIONS,
  finalization: POST_PUSH_OPTIONS,
});

class UsageError extends Error {}

// The proof itself, with no file access: parse errors stop before evaluation,
// and acceptance-id disagreements join the convergence remainder.
function refinementProof({ body, children = [] }) {
  const parsed = parseIssueBodyRecords(body);
  if (parsed.errors.length > 0) return { outcome: "parse error", remainder: parsed.errors };
  const convergence = evaluateConvergence({ ...parsed.input, children });
  const remainder = [...parsed.remainder, ...convergence.remainder];
  return { outcome: remainder.length === 0 ? "verified" : "actionable remainder", remainder };
}

// The post-push input: the observed rows and the pushed head replace the
// planned matrix. A body or handoff that cannot be read stops with a failure
// result before any evaluation runs.
function assembleInput({ body, handoff, headSha, children }) {
  const parsed = parseIssueBodyRecords(body);
  if (parsed.errors.length > 0) {
    return { failure: { outcome: "parse error", remainder: parsed.errors } };
  }
  const matrix = readHandoffMatrix(handoff);
  if (matrix.error) {
    return { failure: { outcome: "parse error", remainder: [matrix.error] } };
  }
  const input = postPushInput({ input: parsed.input, rows: matrix.rows, headSha });
  return { parsed, input: { ...input, children } };
}

// The post-push proof: the same convergence rules run at the pushed head.
function outcomeOf(remainder) {
  if (remainder.length === 0) {
    return { outcome: "verified", remainder };
  }
  return { outcome: "actionable remainder", remainder };
}

function postPushProof({ body, handoff, headSha, children = [] }) {
  const assembled = assembleInput({ body, handoff, headSha, children });
  if (assembled.failure) {
    return assembled.failure;
  }
  const { parsed, input } = assembled;
  const convergence = evaluateConvergence(input);
  return outcomeOf([...parsed.remainder, ...convergence.remainder]);
}

// finalization is the same proof as post-push minus the planned matrix, plus the
// gate's own head check; it is the dry run complete-pr runs before the helper
// readies or merges.
function finalizationProof({ body, handoff, headSha, children = [] }) {
  const assembled = assembleInput({ body, handoff, headSha, children });
  if (assembled.failure) {
    return assembled.failure;
  }
  const { parsed, input } = assembled;
  const result = evaluateStructuredFinalization(input);
  const remainder = [...parsed.remainder, ...result.remainder];
  if (result.outcome !== "verified" && remainder.length === 0) {
    remainder.push(`finalization gate reported ${result.outcome}`);
  }
  return outcomeOf(remainder);
}

function optionsFrom(argv) {
  const [subcommand, ...rest] = argv;
  const allowed = SUBCOMMANDS[subcommand];
  if (allowed === undefined) {
    throw new UsageError("the first argument must be the refinement, post-push, or finalization subcommand");
  }
  const options = parseArgs(rest);
  if (options === null) {
    throw new UsageError(`unexpected argument ${rest.find((item) => !item.startsWith("--"))}`);
  }
  const unknown = Object.keys(options).find((name) => !allowed.has(name));
  if (unknown) {
    const onlyPostPush = ["handoff-file", "head-sha"].includes(unknown) && subcommand === "refinement";
    if (onlyPostPush) {
      throw new UsageError(`--${unknown} only applies to post-push`);
    }
    throw new UsageError(`unknown option --${unknown}`);
  }
  if (!options["body-file"] || options["body-file"] === "true") {
    throw new UsageError("--body-file=<path> is required");
  }
  if (subcommand !== "refinement") {
    if (!options["handoff-file"] || options["handoff-file"] === "true") {
      throw new UsageError("--handoff-file=<path> is required");
    }
    if (!options["head-sha"] || options["head-sha"] === "true") {
      throw new UsageError("--head-sha=<sha> is required");
    }
  }
  return { subcommand, options };
}

// Windows PowerShell 5.1 `>` writes UTF-16, which would read as text full of
// NUL characters and report records that are present as missing, so a file
// that is not UTF-8 is refused by name. The decoder drops a UTF-8 byte-order
// mark, which `Out-File -Encoding utf8` writes.
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function readText(file, option) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new UsageError(`cannot read --${option} ${file}`);
  }
  const notUtf8 = new UsageError(`--${option} ${file} is not UTF-8 text; save it as UTF-8`);
  if (bytes.includes(0)) throw notUtf8;
  try {
    return UTF8.decode(bytes);
  } catch {
    throw notUtf8;
  }
}

function readChildren(file) {
  if (file === undefined) return [];
  let children;
  try {
    children = JSON.parse(readText(file, "children"));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError("--children file is not valid JSON");
  }
  if (!Array.isArray(children)) throw new UsageError("--children file must hold a JSON array");
  return children;
}

function main(argv) {
  let result;
  try {
    const { subcommand, options } = optionsFrom(argv);
    const body = readText(options["body-file"], "body-file");
    const children = readChildren(options.children);
    if (subcommand === "refinement") {
      result = refinementProof({ body, children });
    } else {
      const handoff = readText(options["handoff-file"], "handoff-file");
      const proofs = { "post-push": postPushProof, finalization: finalizationProof };
      result = proofs[subcommand]({ body, handoff, headSha: options["head-sha"], children });
    }
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    result = { outcome: "usage error", remainder: [error.message] };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return EXIT_CODES[result.outcome] ?? 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
