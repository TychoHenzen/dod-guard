// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { readFileSync, writeFileSync } from "node:fs";
import { judgedCandidates, scannerCandidates } from "./finding-ids.mjs";
import { pbiIssue, requirePlan, reviewSlots, slotsByLens, subIssueList } from "./review-slots.mjs";
import { requireScannerQuestions } from "./scanner-plan.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

function json(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON from ${path}: ${error.message}`, { cause: error });
  }
}

// Reads the saved PBI issue and sub-issue listing, naming the file on any
// fault.
function pbiInputs(args) {
  return {
    pbi: pbiIssue(json(args.pbi), args.pbi),
    subIssues: subIssueList(json(args["sub-issues"]), args["sub-issues"]),
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function scannerList(args) {
  const changedLines = parseChangedLines(readFileSync(args.diff, "utf8"));
  return { changedLines, scanner: scannerCandidates(json(args.scan), changedLines) };
}

// The S ids come from the scan and diff alone, so they exist before planning
// and the planner can name them in scanner check questions.
function violations(args) {
  const { scanner } = scannerList(args);
  writeJson(args.out, scanner);
  const files = new Set(scanner.map(({ file }) => file)).size;
  return { out: args.out, violations: scanner.length, files };
}

// The merge pass reads this file, but the build never does: it regenerates
// both id sets from the same inputs, so an edited file cannot move an id.
function candidates(args) {
  const { changedLines, scanner } = scannerList(args);
  const plan = json(args.plan);
  requireScannerQuestions(plan, scanner);
  requirePlan(plan, reviewSlots({ changedLines, ...pbiInputs(args) }));
  const judged = judgedCandidates(json(args.results), slotsByLens(plan));
  writeJson(args.out, { judged, scanner });
  return { out: args.out, judged: judged.length, scanner: scanner.length };
}

export { candidates, json, pbiInputs, violations };
