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

function compare(before, after) {
  const rows = [];
  const beforeById = Object.fromEntries(before.map((c) => [c.id, c]));
  for (const a of after) {
    const b = beforeById[a.id] ?? { pass: false, value: "n/a", detail: "n/a" };
    const status = a.pass && !b.pass ? "FIXED" : !a.pass && b.pass ? "REGRESSED" : a.pass ? "PASS" : "FAIL";
    rows.push({
      id: a.id,
      label: a.label,
      before: { pass: b.pass, value: b.value, detail: b.detail, score: b.score ?? 0 },
      after: { pass: a.pass, value: a.value, detail: a.detail, score: a.score ?? 0 },
      status,
    });
  }
  return rows;
}

function printComparisonResult(beforeData, checks, score, kind, asJson) {
  const rows = compare(beforeData.checks, checks);
  const scores = { before: beforeData.score ?? overallScore(beforeData.checks), after: score };
  const exit = rows.some((r) => r.status === "REGRESSED") ? 1 : 0;
  if (asJson) {
    const out = { ...scores, delta: scores.after - scores.before, kind, rows };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return exit;
  }
  printComparison(rows, scores);
  return exit;
}

export function runComparison(args, checks, score, kind) {
  const beforeData = JSON.parse(readFileSync(args.before, "utf8"));
  const mismatch = kindMismatch(beforeData.kind, kind);
  if (mismatch) {
    process.stderr.write(`Cannot compare: baseline kind "${mismatch}" does not match current kind "${kind}"\n`);
    return 3;
  }
  return printComparisonResult(beforeData, checks, score, kind, args.json === "true");
}
