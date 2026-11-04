// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
import { planHash } from "./plan-hash.mjs";
import { inputs, write } from "./review-findings-cli.test-support.mjs";
import { findingsFixture } from "./review-pr.test-support.mjs";

const HEAD = "f".repeat(40);
const ASSIGNED = {
  "review-pr-feature": ["file:src/a.mjs"],
  "review-pr-design": ["file:src/a.mjs"],
  "review-pr-reliability": ["criterion:1"],
  "review-pr-hygiene": ["criterion:2"],
};
const RESULTS = findingsFixture.REVIEWERS.map((reviewer) => ({
  reviewer,
  rulings: ASSIGNED[reviewer].map((slot) => ({
    slot,
    status: "VERIFIED",
    evidence: "ok",
  })),
  findings: [],
}));
const question = (id, lens) => ({
  id,
  lens,
  question: `Does ${lens} hold?`,
  files: ["src/a.mjs"],
  status: "verified",
});
const PLAN = [
  {
    slot: "file:src/a.mjs",
    questions: [question("F1", "review-pr-feature"), question("D1", "review-pr-design")],
  },
  { slot: "criterion:1", questions: [question("R1", "review-pr-reliability")] },
  { slot: "criterion:2", questions: [question("H1", "review-pr-hygiene")] },
];

// build takes the slot inputs plus the scan, the reviewer results, the plan,
// the merge pass output, and the head.
function buildFlags(dir) {
  return {
    ...inputs(dir),
    out: join(dir, "payload.json"),
    comments: join(dir, "scanner-comments.json"),
    scan: write(dir, "scan.json", { violations: [] }),
    results: write(dir, "results.json", RESULTS),
    plan: write(dir, "plan.json", PLAN),
    merge: write(dir, "merge.json", { groups: [], scanner: [] }),
    answers: write(dir, "answers.json", { planHash: planHash(PLAN), headSha: HEAD, answers: [] }),
  };
}

function buildArgs(paths) {
  return [
    `--head=${HEAD}`,
    `--scan=${paths.scan}`,
    `--diff=${paths.diff}`,
    `--pbi=${paths.pbi}`,
    `--sub-issues=${paths.subs}`,
    `--plan=${paths.plan}`,
    `--results=${paths.results}`,
    `--merge=${paths.merge}`,
    `--answers=${paths.answers}`,
    `--out=${paths.out}`,
    `--scanner-comments-out=${paths.comments}`,
  ];
}

export { buildArgs, buildFlags, HEAD, PLAN };
