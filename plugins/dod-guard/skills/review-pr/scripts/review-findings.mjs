#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { parseArgs } from "../../../lib/args.mjs";
import { readJsonFile, readTextFile } from "../../../lib/read-text.mjs";
import { answers, batches, pending } from "./lib/batch-commands.mjs";
import { candidates, pbiInputs, violations } from "./lib/candidate-commands.mjs";
import { validArgs } from "./lib/command-args.mjs";
import { requireFreshAnswers } from "./lib/review-batches.mjs";
import { buildReview, existingReview, postedFindings } from "./lib/review-findings.mjs";
import { reviewSlots } from "./lib/review-slots.mjs";
import { scan } from "./lib/scan-command.mjs";
import { parseChangedLines } from "./lib/unified-diff.mjs";
import { visibleIdEdits } from "./lib/visible-ids.mjs";

const USAGE = [
  "Usage:",
  "  review-findings.mjs scan --client=claude|codex --registry=<plugin-list.json>",
  "    --root=<repo> --out=<scan.json>",
  "  review-findings.mjs existing --reviews=<reviews.json>",
  "  review-findings.mjs slots --diff=<unified0.diff> --pbi=<issue.json>",
  "    --sub-issues=<sub-issues.json> --out=<slots.json>",
  "  review-findings.mjs violations --scan=<scan.json> --diff=<unified0.diff>",
  "    --out=<violations.json>",
  "  review-findings.mjs batches --plan=<plan.json> --head=<sha> --out-dir=<batches-dir>",
  "  review-findings.mjs answers --plan=<plan.json> --head=<sha> --answers-dir=<answers-dir>",
  "    --out=<answers.json>",
  "  review-findings.mjs pending --plan=<plan.json> --head=<sha> --answers-dir=<answers-dir>",
  "  review-findings.mjs candidates --scan=<scan.json> --diff=<unified0.diff> --pbi=<issue.json>",
  "    --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --answers=<answers.json>",
  "    --out=<candidates.json>",
  "  review-findings.mjs build --head=<sha> --scan=<scan.json> --diff=<unified0.diff>",
  "    --pbi=<issue.json> --sub-issues=<sub-issues.json> --plan=<plan.json>",
  "    --results=<results.json> --merge=<merge.json> --answers=<answers.json> --out=<payload.json>",
  "    --scanner-comments-out=<scanner-comments.json>",
  "  review-findings.mjs label --review-id=<id> --comments=<review-comments.json> --out=<edits.json>",
  "  review-findings.mjs report --review-id=<id> --comments=<review-comments.json>",
].join("\n");

// `gh api --paginate --slurp` writes an array of pages; a plain read writes one array.
function flatJson(path) {
  return readJsonFile(path).flat();
}

function slotCounts(slots) {
  const count = (kind) => slots.filter((slot) => slot.kind === kind).length;
  return {
    files: count("file"),
    criteria: count("criterion"),
    subIssues: count("sub-issue"),
  };
}

const COMMANDS = {
  scan,
  existing: (args) => existingReview(flatJson(args.reviews)),
  slots: (args) => {
    const slots = reviewSlots({
      changedLines: parseChangedLines(readTextFile(args.diff)),
      ...pbiInputs(args),
    });
    writeFileSync(args.out, `${JSON.stringify(slots, null, 2)}\n`);
    return { out: args.out, slots: slots.length, ...slotCounts(slots) };
  },
  batches,
  answers,
  pending,
  violations,
  candidates,
  build: (args) => {
    requireFreshAnswers(readJsonFile(args.answers), readJsonFile(args.plan), args.head);
    const review = buildReview({
      headSha: args.head,
      scan: readJsonFile(args.scan),
      diff: readTextFile(args.diff),
      results: readJsonFile(args.results),
      plan: readJsonFile(args.plan),
      merge: readJsonFile(args.merge),
      ...pbiInputs(args),
    });
    writeFileSync(args.out, JSON.stringify(review.payload));
    writeFileSync(args["scanner-comments-out"], JSON.stringify(review.scannerComments));
    return {
      recommendation: review.recommendation,
      counts: review.counts,
      inline: review.payload.comments.length,
      scannerComments: review.scannerComments.length,
      payload: args.out,
    };
  },
  label: (args) => {
    const edits = visibleIdEdits(Number(args["review-id"]), flatJson(args.comments));
    writeFileSync(args.out, JSON.stringify(edits));
    return { edits: edits.length, out: args.out };
  },
  report: (args) => postedFindings(Number(args["review-id"]), flatJson(args.comments)),
};

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
if (!(validArgs(command, args) && COMMANDS[command])) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(3);
}
process.stdout.write(`${JSON.stringify(COMMANDS[command](args), null, 2)}\n`);
