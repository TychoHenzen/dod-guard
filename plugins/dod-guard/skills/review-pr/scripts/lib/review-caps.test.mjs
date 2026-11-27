// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CAPS } from "../../../../lib/github-text.mjs";
import { anchor } from "./anchor-findings.mjs";
import { commentBound } from "./comment-bound.mjs";
import { judgedCandidates, scannerCandidates } from "./finding-ids.mjs";
import { mergedFindings } from "./merge-groups.mjs";
import { bodyBound, LISTED, reviewBody } from "./review-body.mjs";
import { buildReview } from "./review-findings.mjs";
import { complete, findingsFixture, judgment } from "./review-pr.test-support.mjs";
import { slotsByLens } from "./review-slots.mjs";
import { scannerFinding } from "./scanner-findings.mjs";
import { parseChangedLines } from "./unified-diff.mjs";
import { widestLabelled } from "./visible-ids.mjs";

const { HEAD, PBI, REVIEWERS, hunk, question } = findingsFixture;

test("the largest body the template can make is under the review cap", () => {
  assert.ok(bodyBound() <= CAPS.reviewBody, `bound is ${bodyBound()}`);
});

// The bound is a real upper bound: a body built from fields far longer than
// any reviewer writes, with every count at its widest, does not pass it.
test("no body is longer than the bound", () => {
  const widest = Number.MAX_SAFE_INTEGER;
  const huge = { severity: "BLOCKER", file: "f".repeat(5000), line: widest, headline: "h".repeat(5000) };
  const counts = { BLOCKER: widest, MAJOR: widest, MINOR: widest };
  const many = (count) => Array.from({ length: count }, () => huge);
  for (const deferred of [0, 1, LISTED - 1, LISTED, LISTED + 50]) {
    const body = reviewBody({
      headSha: HEAD,
      recommendation: "REQUEST_CHANGES",
      counts,
      threads: widest,
      deferred: many(deferred),
      minor: many(500),
    });
    assert.ok(body.length <= bodyBound(), `${deferred} deferred: ${body.length} > ${bodyBound()}`);
  }
});

test("the largest inline comment, with its GH-<id>, is under the comment cap", () => {
  assert.ok(commentBound() <= CAPS.reviewComment, `bound is ${commentBound()}`);
});

const huge = (letter) => letter.repeat(5000);
// The file is only trimmed, so each comment carries the longest moved-location note.
const trimmedOnly = (finding) => ({
  added: new Map(),
  removed: new Map([[finding.file, new Set([finding.line + 7])]]),
});

// The bound is a real upper bound: a finding every lens reported with every
// field far past its limit, and a scanner thread of many long rules and
// messages, do not pass it once moved off their cited line.
test("no inline comment is longer than the bound", () => {
  const judged = REVIEWERS.map((reviewer, index) => ({
    id: `J${index}`,
    reviewer,
    severity: "BLOCKER",
    file: huge("f"),
    line: Number.MAX_SAFE_INTEGER - 7,
    problem: huge("p"),
    impact: huge("i"),
    correction: huge("c"),
    rootCause: huge("r"),
    requirement: huge("a"),
    evidence: huge("e"),
  }));
  const [merged] = mergedFindings([{ members: judged.map(({ id }) => id), representative: "J0" }], judged);
  const violations = Array.from({ length: 300 }, (_, index) => ({
    rule: `${huge("u")}${index % 10}`,
    severity: "high",
    line: index + 1,
    message: huge("m"),
    existing: index % 3 === 0,
  }));
  const scanner = scannerFinding(huge("f"), violations);
  for (const finding of [merged, scanner]) {
    const { body } = anchor(finding, trimmedOnly(finding), null);
    assert.ok(widestLabelled(body).length <= commentBound(), `${widestLabelled(body).length} > ${commentBound()}`);
  }
});

// CardCleaner PR 535: 427 plan slots made a 117442-character body that GitHub
// refused. This builds that plan with every lens ruling FINDING on every slot
// it was given, every reviewer field far past its stated length, and 581 kept
// scanner violations with long messages.
const FILE_SLOTS = 426;
const LONG = (letter, count) => letter.repeat(count);

function cardCleanerScale() {
  const files = Array.from(
    { length: FILE_SLOTS },
    (_, index) => `src/CardCleaner/Feature${index}/Component${index}.cs`,
  );
  const diff = files.flatMap((file) => hunk(file, 10)).join("\n");
  const lensPair = (index) => [REVIEWERS[index % 4], REVIEWERS[(index + 1) % 4]];
  const plan = [
    ...files.map((file, index) => ({
      slot: `file:${file}`,
      questions: lensPair(index).map((lens, at) => ({
        ...question(`Q${index}x${at}`, lens),
        question: `${LONG("q", 200)}?`,
        files: [file],
      })),
    })),
    { slot: "criterion:1", questions: [question("C1", REVIEWERS[0]), question("C2", REVIEWERS[1])] },
  ];
  const assigned = slotsByLens(plan);
  const findingFor = (slot) =>
    judgment(slot.slice("file:".length), {
      line: 10,
      problem: LONG("p", 1000),
      impact: LONG("i", 1000),
      correction: LONG("c", 1000),
      rootCause: LONG("r", 1000),
      requirement: LONG("a", 1000),
      evidence: LONG("e", 5000),
    });
  const results = complete(
    REVIEWERS.map((reviewer) => ({
      reviewer,
      findings: [...assigned.get(reviewer)].filter((slot) => slot.startsWith("file:")).map(findingFor),
    })),
    assigned,
  );
  const violations = Array.from({ length: 581 }, (_, index) => ({
    file: files[index % 60],
    line: 10,
    rule: ["complexity", "function-length", "duplicate-block"][index % 3],
    severity: "high",
    message: LONG("m", 2000),
  }));
  const scan = { violations };
  const judged = judgedCandidates(results, assigned);
  const scanner = scannerCandidates(scan, parseChangedLines(diff));
  const merge = {
    groups: judged.map(({ id }) => ({ members: [id], representative: id })),
    scanner: [{ ids: scanner.map(({ id }) => id), status: "KEEP" }],
  };
  return buildReview({ headSha: HEAD, scan, diff, plan, pbi: PBI, subIssues: [], results, merge });
}

test("a 427-slot plan with every slot a finding stays within both caps", () => {
  const review = cardCleanerScale();
  const { body, comments } = review.payload;
  assert.equal(review.counts.MAJOR, FILE_SLOTS * 2 + 60);
  assert.ok(body.length <= CAPS.reviewBody, `body is ${body.length} characters`);
  assert.equal(comments.length, 5);
  for (const comment of comments) {
    assert.ok(widestLabelled(comment.body).length <= commentBound(), `comment is ${comment.body.length} characters`);
  }
  assert.equal(body.split("\n").filter((line) => line.startsWith("- ")).length, LISTED);
  assert.match(
    body,
    new RegExp(`\\.\\.\\.and ${review.deferred - LISTED} more findings, counted above and not listed\\.$`),
  );
});
