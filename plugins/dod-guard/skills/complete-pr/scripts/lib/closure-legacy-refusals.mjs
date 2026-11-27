// Every reason record-legacy or record-ordinary refuses a delivery, judged from the live read before any
// write. Both record a ticket with no structured handoff; `kind` ("legacy" or "ordinary") names which
// one, and the ordinary kind also needs the pull request's ordinary-path evidence. An empty list means
// the delivery may be recorded.
import { requiredChecksComplete } from "../../../../lib/queue-classifier.mjs";
import { pullReasons } from "./closure-legacy-pull.mjs";
import { parseCompletionRecord } from "./closure-records.mjs";
import { ordinaryEvidenceReasons, structuredMarkers } from "./ordinary-evidence.mjs";

function issueReasons(live) {
  if (live.issue?.state === "closed") {
    return [];
  }
  return [`issue #${live.issueNumber} is not closed`];
}

// A rerun may update a record of its own kind in place; any other record belongs to another path.
function completionReasons(live, kind) {
  const parsed = parseCompletionRecord(live.comments);
  if (parsed.error) {
    return [parsed.error];
  }
  if (parsed.record && parsed.record[kind] !== true) {
    return [`issue #${live.issueNumber} already has a non-${kind} completion record`];
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

function evidenceReasons(live, kind) {
  return kind === "ordinary" ? ordinaryEvidenceReasons(live) : [];
}

const REFUSAL_CHECKS = [issueReasons, structuredMarkers, completionReasons, pullReasons, checkReasons, evidenceReasons];

function unstructuredRefusals(live, kind) {
  return REFUSAL_CHECKS.flatMap((check) => check(live, kind));
}

export { unstructuredRefusals };
