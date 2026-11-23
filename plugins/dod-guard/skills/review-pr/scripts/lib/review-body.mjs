import { fitSections } from "./body-entries.mjs";
import { MAX_FIX_THREADS } from "./fix-threads.mjs";

// The review body: the marker step 2 detects, its sections, and the size check
// that keeps it under GitHub's limit.

const MARKER = /<!-- dod-guard:review-pr head=([0-9a-f]{7,40}) recommendation=(APPROVE|REQUEST_CHANGES|BLOCK) -->/;

// ASSUMPTION: GitHub rejects a pull request review body over 65536 characters.
// The review is posted once, so the build refuses before that single attempt.
const MAX_REVIEW_BODY = 65_536;

function marker(headSha, recommendation) {
  return `<!-- dod-guard:review-pr head=${headSha} recommendation=${recommendation} -->`;
}

function omissionNote(omitted) {
  const files = omitted === 1 ? "file has" : "files have";
  return `\n${omitted} more ${files} scanner findings, listed only in the scanner findings comments.`;
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
// every heading and no entries, and the entries fill what that leaves.
// `summarized` says some scanner group is already shown short. `listed` says the
// body points at the scanner comments, so the caller must post them.
function fittedBody(parts, { deferred, minor, summarized }) {
  const empty = { deferred: [], minor: [], omitted: 0 };
  const fixed = reviewBody({ ...parts, sections: empty, listed: true, hasMinor: true, hasDeferred: true });
  const sections = fitSections(MAX_REVIEW_BODY - fixed.length, { deferred, minor });
  const listed = sections.omitted > 0 || summarized;
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
