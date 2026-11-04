// Every reason record-legacy refuses a delivery, judged from the live read before any write. An empty
// list means the delivery may be recorded.
import { markdownSection } from "../../../../lib/acceptance-criteria.mjs";
import { requiredChecksComplete } from "../../../../lib/queue-classifier.mjs";
import { subsections } from "../../../../lib/record-readers.mjs";
import { pullReasons } from "./closure-legacy-pull.mjs";
import { parseCompletionRecord } from "./closure-records.mjs";

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

function issueReasons(live) {
  if (live.issue?.state === "closed") {
    return [];
  }
  return [`issue #${live.issueNumber} is not closed`];
}

function structuredRecordReasons(live) {
  const notes = markdownSection(live.issue?.body ?? "", "Implementation notes");
  return STRUCTURED_RECORDS.filter((name) => subsections(notes, name).length > 0).map(
    (name) => `issue #${live.issueNumber} holds structured record ${name}`,
  );
}

// ASSUMPTION: a comment counts as a handoff only when its trimmed body starts with the heading, as the
// structured path's handoff comment does; a quoted heading mid-body does not count.
function handoffReasons(live) {
  const found = live.comments.some((comment) =>
    String(comment?.body ?? "")
      .trimStart()
      .startsWith(HANDOFF_HEADING),
  );
  if (!found) {
    return [];
  }
  return [`issue #${live.issueNumber} has an implementation handoff comment`];
}

function completionReasons(live) {
  const parsed = parseCompletionRecord(live.comments);
  if (parsed.error) {
    return [parsed.error];
  }
  if (parsed.record && parsed.record.legacy !== true) {
    return [`issue #${live.issueNumber} already has a non-legacy completion record`];
  }
  return [];
}

// The checks are read only for a merged pull request, so a null read adds no reason of its own.
function checkReasons(live) {
  if (live.checks === null) {
    return [];
  }
  const verdict = requiredChecksComplete(live.checks);
  if (verdict.complete) {
    return [];
  }
  return [verdict.reason];
}

const REFUSAL_CHECKS = [
  issueReasons,
  structuredRecordReasons,
  handoffReasons,
  completionReasons,
  pullReasons,
  checkReasons,
];

function legacyRefusals(live) {
  return REFUSAL_CHECKS.flatMap((check) => check(live));
}

export { legacyRefusals };
