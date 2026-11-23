import { MAX_FIX_THREADS } from "./fix-threads.mjs";
import { fitScanner } from "./scanner-summary.mjs";

// The review body: the marker step 2 detects, its sections, and the fit that
// keeps it under GitHub's limit.

const MARKER = /<!-- dod-guard:review-pr head=([0-9a-f]{7,40}) recommendation=(APPROVE|REQUEST_CHANGES|BLOCK) -->/;

// ASSUMPTION: GitHub rejects a pull request review body over 65536 characters.
// The review is posted once, so the build refuses before that single attempt.
const MAX_REVIEW_BODY = 65_536;

// Room kept for the omission note, which is added after the fit.
const NOTES_RESERVE = 1000;

function marker(headSha, recommendation) {
  return `<!-- dod-guard:review-pr head=${headSha} recommendation=${recommendation} -->`;
}

function minorText(finding) {
  const location = `\`${finding.file}:${finding.line}\``;
  return { scanner: finding.scanner, text: ["", location, finding.body].join("\n") };
}

function omissionNote(omitted) {
  const files = omitted === 1 ? "file has" : "files have";
  return `\n${omitted} more ${files} scanner findings, listed only in the scanner findings comments.`;
}

// One line per deferred finding, its location and its headline, so each entry stays short.
function deferredLine(finding) {
  return `\`${finding.file}:${finding.line}\` ${finding.body.split("\n")[0]}`;
}

// Deferred findings and minor notes share what the rest of the body leaves, so a
// plan with many slots or a move with many flagged files still posts. Judged
// entries always render, so their text is counted first. A scanner group, deferred
// or minor, renders only while there is room: the scanner comments list them all.
function fitSections(fixedBody, { deferred, minor }) {
  const entries = {
    deferred: deferred.map((finding) => ({ scanner: finding.scanner, text: deferredLine(finding) })),
    minor: minor.map(minorText),
  };
  const all = [...entries.deferred, ...entries.minor];
  const judged = all.filter((entry) => !entry.scanner).reduce((sum, entry) => sum + entry.text.length + 1, 0);
  const room = Math.max(0, MAX_REVIEW_BODY - fixedBody.length - judged - NOTES_RESERVE);
  const fitted = fitScanner(all, room);
  const placed = new Set(fitted.placed);
  const texts = (list) => list.filter((entry) => placed.has(entry)).map(({ text }) => text);
  return { deferred: texts(entries.deferred), minor: texts(entries.minor), omitted: fitted.omitted };
}

function reviewBody({ headSha, recommendation, counts, block, sections, listed, hasMinor, hasDeferred }) {
  const lines = [
    marker(headSha, recommendation),
    "## dod-guard review",
    "",
    `Recommendation: **${recommendation}**`,
    `Findings: ${counts.BLOCKER} BLOCKER, ${counts.MAJOR} MAJOR, ${counts.MINOR} MINOR.`,
    "",
    block,
  ];
  if (listed) {
    lines.push("", "Scanner findings are summarized per file here. The full list is posted as pull request comments");
    lines.push("headed `dod-guard scanner findings`, right after this review.");
  }
  if (hasDeferred) {
    lines.push("", "### Deferred findings", "");
    lines.push(
      `Only the ${MAX_FIX_THREADS} worst findings get a thread to fix in this pull request. These need no reply.`,
    );
    lines.push("", ...sections.deferred);
  }
  if (hasMinor) {
    lines.push("", "### Minor notes", "", "These do not block the merge and need no reply.", ...sections.minor);
  }
  if (sections.omitted > 0) {
    lines.push(omissionNote(sections.omitted));
  }
  return lines.join("\n");
}

// `parts` holds the header and the plan block. The body is measured once with
// every heading and no entries, and the entries fill what that leaves. `listed`
// says the body points at the scanner comments, so the caller must post them.
function fittedBody(parts, { deferred, minor, truncated }) {
  const empty = { deferred: [], minor: [], omitted: 0 };
  const fixed = reviewBody({ ...parts, sections: empty, listed: true, hasMinor: true, hasDeferred: true });
  const sections = fitSections(fixed, { deferred, minor });
  const listed = sections.omitted > 0 || truncated;
  const shown = { hasMinor: minor.length > 0, hasDeferred: deferred.length > 0 };
  return { body: reviewBody({ ...parts, sections, listed, ...shown }), listed };
}

function requirePostableBody(body, slotCount) {
  if (body.length > MAX_REVIEW_BODY) {
    throw new Error(
      `The review body is ${body.length} characters, over the ` +
        `${MAX_REVIEW_BODY}-character limit, with ${slotCount} slots. ` +
        "Nothing was posted; shorten question text in the plan and rebuild.",
    );
  }
  return body;
}

export { fittedBody, MARKER, requirePostableBody };
