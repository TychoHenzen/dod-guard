import { readFileSync } from "node:fs";
import process from "node:process";
import { printComparison } from "./report.mjs";
import { overallScore } from "./scoring.mjs";

// A baseline saved before the --kind field existed carries no `kind`, and
// that missing field matches any current kind rather than blocking. Only an
// explicit, different kind refuses the comparison - the per-kind weight
// tables make a cross-kind score delta meaningless.

function kindMismatch(beforeKind, currentKind) {
  if (beforeKind === undefined || beforeKind === null) return null;
  if (beforeKind === currentKind) return null;
  return beforeKind;
}

const MISSING_BASELINE = { pass: false, value: "n/a", detail: "n/a" };

function rowStatus(after, before) {
  const passed = Boolean(after.pass);
  if (passed === Boolean(before.pass)) return passed ? "PASS" : "FAIL";
  return passed ? "FIXED" : "REGRESSED";
}

const side = ({ pass, value, detail, score }) => ({ pass, value, detail, score: score ?? 0 });

function compareRow(after, before) {
  return {
    id: after.id,
    label: after.label,
    before: side(before),
    after: side(after),
    status: rowStatus(after, before),
  };
}

function compare(before, after) {
  const beforeById = Object.fromEntries(before.map((c) => [c.id, c]));
  return after.map((a) => compareRow(a, beforeById[a.id] ?? MISSING_BASELINE));
}

function printComparisonResult(beforeData, run, asJson) {
  const rows = compare(beforeData.checks, run.checks);
  const scores = { before: beforeData.score ?? overallScore(beforeData.checks), after: run.score };
  const exit = rows.some((r) => r.status === "REGRESSED") ? 1 : 0;
  if (asJson) {
    const out = { ...scores, delta: scores.after - scores.before, kind: run.kind, rows };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return exit;
  }
  printComparison(rows, scores);
  return exit;
}

export function runComparison(args, run) {
  const beforeData = JSON.parse(readFileSync(args.before, "utf8"));
  const mismatch = kindMismatch(beforeData.kind, run.kind);
  if (mismatch) {
    process.stderr.write(`Cannot compare: baseline kind "${mismatch}" does not match current kind "${run.kind}"\n`);
    return 3;
  }
  return printComparisonResult(beforeData, run, args.json === "true");
}
