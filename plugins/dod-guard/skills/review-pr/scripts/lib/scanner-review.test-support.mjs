import { scannerCandidates } from "./finding-ids.mjs";
import { buildReview } from "./review-findings.mjs";
import { complete, findingsFixture } from "./review-pr.test-support.mjs";
import { slotsByLens } from "./review-slots.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

const { REVIEWERS, HEAD, PBI, question, hunk } = findingsFixture;

// A diff that only deletes two lines, so the file gets no added line.
const removalHunk = (file) => [
  `diff --git a/${file} b/${file}`,
  `--- a/${file}`,
  `+++ b/${file}`,
  "@@ -3,2 +3,0 @@",
  "-x",
  "-y",
];

function fileHunk(file, line, removed) {
  if (removed.includes(file)) {
    return removalHunk(file);
  }
  return hunk(file, line);
}

// One added line per file, one scanner check question per file slot listing
// that file's S ids, and every lens asked about the criterion so no judge idles.
// Files listed in `removed` only delete lines, so they get no added line and
// no `file:` plan slot; the slot generator emits file slots only for added lines.
function scannerReview({ files, line, violations, rule, removed = [] }) {
  const diff = files.flatMap((file) => fileHunk(file, line, removed)).join("\n");
  const candidates = scannerCandidates({ violations }, parseChangedLines(diff));
  const idsOf = (file) => candidates.filter((item) => item.file === file).map(({ id }) => id);
  const slot = (file, index) => {
    const asked = { ...question(`Q${index + 1}`, "review-pr-hygiene"), files: [file] };
    return { slot: `file:${file}`, questions: [{ ...asked, scanner: idsOf(file) }] };
  };
  const criterion = REVIEWERS.map((lens, index) => question(`C${index + 1}`, lens));
  const withLines = files.filter((file) => !removed.includes(file));
  const plan = [...withLines.map(slot), { slot: "criterion:1", questions: criterion }];
  const results = complete([], slotsByLens(plan));
  const scanner = files.map((file, index) => rule(idsOf(file), index));
  const inputs = { headSha: HEAD, scan: { violations }, diff, plan, pbi: PBI, subIssues: [] };
  return buildReview({ ...inputs, results, merge: { groups: [], scanner } });
}

export { scannerReview };
