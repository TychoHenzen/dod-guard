// Picks the next queue item from a Project snapshot the caller already read.
// The caller fetches with its own GitHub connector (see
// standards/github-request-discipline.md) and saves the result as JSON; this
// script classifies it through the shared queue classifier, so it makes no
// provider calls and no mutations.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { localDate } from "../../../lib/friction-log.mjs";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import { readJsonFile } from "../../../lib/read-text.mjs";
import { USAGE } from "./select-next-usage.mjs";

const EMPTY_SNAPSHOT = { items: [], issues: [], pullRequests: [] };

function groupSummary({ rootIssueNumber, decision }) {
  return { rootIssueNumber, kind: decision.kind, reasons: decision.reasons };
}

const HELD_KINDS = new Set(["hold", "needs-refinement"]);

// A null selection with held work or missing evidence is not an exhausted queue.
function queueStateOf({ groups, selected, missingEvidence }) {
  if (selected) return "ready";
  const held = missingEvidence.length > 0 || groups.some(({ decision }) => HELD_KINDS.has(decision.kind));
  return held ? "held" : "exhausted";
}

function selectNext(input, today) {
  const snapshot = { ...EMPTY_SNAPSHOT, ...input };
  const queue = classifyQueue(snapshot, { today });
  const { groups, selected, counts, missingEvidence } = queue;
  return {
    queueState: queueStateOf(queue),
    selected: selected && {
      rootIssueNumber: selected.rootIssueNumber,
      status: selected.decision.status,
      issueNumbers: selected.records.map(({ issueNumber }) => issueNumber),
    },
    groups: groups.map(groupSummary),
    counts,
    missingEvidence,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args?.snapshot || args.snapshot === "true") {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const snapshot = readJsonFile(args.snapshot);
  // The only clock read. The classifier takes the date as data, so it stays a pure function.
  const today = snapshot?.today ?? localDate(new Date());
  const result = selectNext(snapshot, today);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) main();
