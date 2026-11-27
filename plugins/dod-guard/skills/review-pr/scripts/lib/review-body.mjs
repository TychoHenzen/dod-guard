import { requireCap } from "../../../../lib/github-text.mjs";
import { clip, shownPath } from "./finding-text.mjs";
import { MAX_FIX_THREADS } from "./fix-threads.mjs";

// The review body lists findings only: the marker step 2 detects, the
// recommendation, the counts, and one line per finding that has no thread. The
// plan, the investigators' answers, the rulings that passed, and the scanner's
// full list stay in the review's own files. The template has a fixed largest
// size, so the review's length is known before any reviewer runs.

const MARKER = /<!-- dod-guard:review-pr head=([0-9a-f]{7,40}) recommendation=(APPROVE|REQUEST_CHANGES|BLOCK) -->/;

// ASSUMPTION: a reader on a phone wants the worst unthreaded findings, not all
// of them. The body lists at most LISTED, worst first, and counts the rest; the
// severity counts above still name every finding.
const LISTED = 15;
const HEADLINE_SHOWN = 200;

function marker(headSha, recommendation) {
  return `<!-- dod-guard:review-pr head=${headSha} recommendation=${recommendation} -->`;
}

function entryLine(finding, withSeverity) {
  const severity = withSeverity ? `${finding.severity} ` : "";
  return `- ${severity}\`${shownPath(finding.file)}:${finding.line}\` ${clip(finding.headline, HEADLINE_SHOWN)}`;
}

function section(heading, note, lines) {
  return lines.length === 0 ? [] : ["", `### ${heading}`, "", note, ...lines];
}

// `deferred` are the BLOCKER and MAJOR findings past the thread cap, `minor`
// the MINOR ones; each is in the build's order, worst first.
function reviewBody({ headSha, recommendation, counts, threads, deferred, minor }) {
  const shownDeferred = deferred.slice(0, LISTED);
  const shownMinor = minor.slice(0, LISTED - shownDeferred.length);
  const left = deferred.length + minor.length - shownDeferred.length - shownMinor.length;
  const lines = [
    marker(headSha, recommendation),
    "## dod-guard review",
    "",
    `Recommendation: **${recommendation}**`,
    `Findings: ${counts.BLOCKER} BLOCKER, ${counts.MAJOR} MAJOR, ${counts.MINOR} MINOR. Threads to fix: ${threads}.`,
    ...section(
      "Deferred findings",
      `Only the ${MAX_FIX_THREADS} worst findings get a thread. These need no reply.`,
      shownDeferred.map((finding) => entryLine(finding, true)),
    ),
    ...section(
      "Minor notes",
      "These do not block the merge and need no reply.",
      shownMinor.map((finding) => entryLine(finding, false)),
    ),
    ...overflow(left),
  ];
  return lines.join("\n");
}

function overflow(left) {
  return left > 0 ? ["", `...and ${left} more findings, counted above and not listed.`] : [];
}

// The largest body the template can make: every listed line at its longest,
// each split of the listed lines between the two sections, and every number at
// its widest. The listed lines fill the body exactly, so the overflow line is
// added at its widest count: its lines plus the newline that joins them. A test
// holds the bound under the cap, and `batches` reports it before any
// investigator runs.
function bodyBound() {
  const widest = Number.MAX_SAFE_INTEGER;
  const longest = { severity: "BLOCKER", file: "f".repeat(400), line: widest, headline: "h".repeat(400) };
  const counts = { BLOCKER: widest, MAJOR: widest, MINOR: widest };
  const sizes = Array.from({ length: LISTED + 1 }, (_, deferred) =>
    reviewBody({
      headSha: "0".repeat(40),
      recommendation: "REQUEST_CHANGES",
      counts,
      threads: widest,
      deferred: Array.from({ length: deferred }, () => longest),
      minor: Array.from({ length: LISTED - deferred }, () => longest),
    }).length,
  );
  return Math.max(...sizes) + overflow(widest).join("\n").length + 1;
}

function requirePostableBody(body) {
  return requireCap("reviewBody", body, "The review body");
}

export { bodyBound, LISTED, MARKER, requirePostableBody, reviewBody };
