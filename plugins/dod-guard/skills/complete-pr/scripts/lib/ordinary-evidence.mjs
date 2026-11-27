// What sorts a ticket onto the structured path, and what an ordinary-path pull request must show before
// it merges or records its delivery. standards/project-workflow.md defines both paths. Every function
// here is pure: the callers read GitHub and pass the issue, its comments and the pull request in.
import { acceptanceCriteria, markdownSection, markedLines } from "../../../../lib/acceptance-criteria.mjs";
import { subsections } from "../../../../lib/record-readers.mjs";

const STRUCTURED_RECORDS = [
  "requirements",
  "clarifications",
  "implementation-plan",
  "task-list",
  "lens-ownership",
  "acceptance-evidence",
  "planned-acceptance-matrix",
];
const HANDOFF_HEADING = "## Implementation handoff";
const STEP_PLAN_HEADING = "## Step plan:";
const ORDINARY_DECLARATION = "- Handoff: none, ordinary path";

function structuredRecordMarkers(live) {
  const notes = markdownSection(live.issue?.body ?? "", "Implementation notes");
  return STRUCTURED_RECORDS.filter((name) => subsections(notes, name).length > 0).map(
    (name) => `issue #${live.issueNumber} holds structured record ${name}`,
  );
}

// ASSUMPTION: a comment counts as a handoff or a step plan only when its trimmed body starts with the
// heading, as the structured path writes them; a quoted heading mid-body does not count. Any author
// counts, so a structured comment never lets a ticket pass as ordinary.
function startsWith(comment, heading) {
  return String(comment?.body ?? "")
    .trimStart()
    .startsWith(heading);
}

const COMMENT_MARKERS = [
  [HANDOFF_HEADING, "has an implementation handoff comment"],
  [STEP_PLAN_HEADING, "has a step plan comment"],
];

function commentMarkers(live) {
  const comments = Array.isArray(live.comments) ? live.comments : [];
  return COMMENT_MARKERS.filter(([heading]) => comments.some((comment) => startsWith(comment, heading))).map(
    ([, tail]) => `issue #${live.issueNumber} ${tail}`,
  );
}

// Every structured record or comment the issue carries. An empty list means the ticket is unstructured:
// a legacy ticket, or one on the ordinary path.
function structuredMarkers(live) {
  return [...structuredRecordMarkers(live), ...commentMarkers(live)];
}

function declaresOrdinaryPath(pullBody) {
  return markedLines(markdownSection(pullBody ?? "", "Convergence")).some(
    (line) => !line.fenced && line.text.trim().startsWith(ORDINARY_DECLARATION),
  );
}

function normalized(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function criterionGap(shown, text) {
  const item = shown.get(text);
  if (!item) {
    return `acceptance criterion missing from the pull request body: ${text}`;
  }
  return item.checked ? null : `acceptance criterion unchecked in the pull request body: ${text}`;
}

// The issue's `## Acceptance criteria` checklist is the source of truth. The pull request body must list
// each of its criteria under the same heading, with the same text once whitespace is collapsed, and
// checked. An extra item the pull request adds may stay only when it is checked.
function acceptanceGaps(live) {
  const wanted = acceptanceCriteria(live.issue?.body).map((item) => normalized(item.text));
  if (wanted.length === 0) {
    return [`issue #${live.issueNumber} has no ## Acceptance criteria checklist`];
  }
  const items = acceptanceCriteria(live.pull?.body).map((item) => ({ ...item, text: normalized(item.text) }));
  const shown = new Map(items.map((item) => [item.text, item]));
  const gaps = wanted.map((text) => criterionGap(shown, text)).filter(Boolean);
  const extras = items.filter((item) => !(item.checked || wanted.includes(item.text)));
  return [...gaps, ...extras.map((item) => `unchecked item in the pull request body: ${item.text}`)];
}

// The ordinary path delivers one issue with no children. A missing count fails closed, because GitHub
// returns sub_issues_summary on every issue read.
function subIssueReasons(live) {
  const total = live.issue?.sub_issues_summary?.total;
  if (!Number.isInteger(total)) {
    return [`issue #${live.issueNumber} sub-issue count is unreadable`];
  }
  return total > 0 ? [`issue #${live.issueNumber} has ${total} sub-issues`] : [];
}

function declarationReasons(live) {
  if (declaresOrdinaryPath(live.pull?.body)) {
    return [];
  }
  return [`pull request #${live.pullNumber} ## Convergence does not declare "${ORDINARY_DECLARATION}"`];
}

// Every reason an unstructured ticket's pull request does not show ordinary-path evidence. An empty list
// means the pull request declares the ordinary path and carries the issue's whole acceptance checklist,
// checked.
function ordinaryEvidenceReasons(live) {
  return [...subIssueReasons(live), ...declarationReasons(live), ...acceptanceGaps(live)];
}

export { ORDINARY_DECLARATION, ordinaryEvidenceReasons, structuredMarkers };
