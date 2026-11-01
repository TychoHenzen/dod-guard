// Records the completion evidence of a ticket delivered before the structured
// handoff existed. It writes PR, head, and merge only, and refuses any ticket
// that carries a structured handoff, so the structured path stays the only way
// to record a ticket that has one. Reads run before the single write.
import { markdownSection } from "../../../../lib/acceptance-criteria.mjs";
import { subsections } from "../../../../lib/issue-body-records.mjs";
import { requiredChecksComplete } from "../../../../lib/queue-classifier.mjs";
import { ClosureStop, gh, readComments, upsertRecord } from "./closure-apply.mjs";
import { parseCompletionRecord, renderCompletionRecord } from "./closure-records.mjs";
import { readMergedRequiredChecks } from "./required-checks.mjs";
import { guardedRunner } from "./snapshot-runner.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;
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

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function closingKeywordPattern(repository, issue) {
  const prefix = escapeRegExp(repository);
  return new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s+(?:${prefix})?#${issue}\\b`, "i");
}

// Reads everything the refusals judge, before any write. The required checks are read only for a
// merged pull request, because an unmerged one is already refused by the merge check.
function readLive(runner, repository, pull, issue) {
  const repo = gh(runner, ["api", `repos/${repository}`]);
  const pullRecord = gh(runner, ["api", `repos/${repository}/pulls/${pull}`]);
  const issueRecord = gh(runner, ["api", `repos/${repository}/issues/${issue}`]);
  const comments = readComments(runner, repository, issue);
  let checks = null;
  if (pullRecord?.merged_at && FULL_SHA.test(pullRecord.head?.sha ?? "")) {
    checks = readMergedRequiredChecks(
      repository,
      { baseBranch: pullRecord.base?.ref, headSha: pullRecord.head?.sha },
      guardedRunner(runner),
    );
  }
  return {
    repository,
    issueNumber: issue,
    pullNumber: pull,
    defaultBranch: repo?.default_branch ?? null,
    pull: pullRecord,
    issue: issueRecord,
    comments,
    checks,
  };
}

// ASSUMPTION: a comment counts as a handoff only when its trimmed body starts with the heading, as the
// structured path's handoff comment does; a quoted heading mid-body does not count.
function hasHandoffComment(comments) {
  return comments.some((comment) =>
    String(comment?.body ?? "")
      .trimStart()
      .startsWith(HANDOFF_HEADING),
  );
}

function structuredRecordReasons(live) {
  const notes = markdownSection(live.issue?.body ?? "", "Implementation notes");
  return STRUCTURED_RECORDS.filter((name) => subsections(notes, name).length > 0).map(
    (name) => `issue #${live.issueNumber} holds structured record ${name}`,
  );
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

function pullReasons(live) {
  const { pull, pullNumber: number, defaultBranch, repository, issueNumber } = live;
  const reasons = [];
  if (!pull.merged_at) {
    reasons.push(`pull request #${number} is not merged`);
  }
  if (!(FULL_SHA.test(pull.merge_commit_sha ?? "") && FULL_SHA.test(pull.head?.sha ?? ""))) {
    reasons.push(`pull request #${number} merge commit or head is missing`);
  }
  if (pull.base?.ref !== defaultBranch) {
    reasons.push(`pull request #${number} base is not the default branch`);
  }
  const headRepository = String(pull.head?.repo?.full_name ?? "").toLowerCase();
  if (headRepository !== String(repository).toLowerCase()) {
    reasons.push(`pull request #${number} head repository is not the target repository`);
  }
  if (!closingKeywordPattern(repository, issueNumber).test(pull.body ?? "")) {
    reasons.push(`pull request #${number} body has no closing keyword for #${issueNumber}`);
  }
  return reasons;
}

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

// Each refusal is a reason string. An empty list means the delivery may be recorded.
function legacyRefusals(live) {
  const reasons = [];
  if (live.issue?.state !== "closed") {
    reasons.push(`issue #${live.issueNumber} is not closed`);
  }
  reasons.push(...structuredRecordReasons(live));
  if (hasHandoffComment(live.comments)) {
    reasons.push(`issue #${live.issueNumber} has an implementation handoff comment`);
  }
  reasons.push(...completionReasons(live));
  reasons.push(...pullReasons(live));
  reasons.push(...checkReasons(live));
  return reasons;
}

function recordLegacyDelivery({ repository, pull, issue, runner }) {
  if (!(isPositiveInteger(pull) && isPositiveInteger(issue))) {
    throw new ClosureStop("record-legacy needs positive integer --pull and --issue", {});
  }
  const live = readLive(runner, repository, pull, issue);
  const reasons = legacyRefusals(live);
  if (reasons.length > 0) {
    throw new ClosureStop(`legacy delivery refused: ${reasons.join("; ")}`, { issue, pull, reasons });
  }
  const body = renderCompletionRecord({
    pullRequest: pull,
    mergeCommit: live.pull.merge_commit_sha,
    trustedHeadSha: live.pull.head.sha,
    requiredChecks: "pass",
    pendingRows: [],
    legacy: true,
  });
  return { records: [upsertRecord(runner, repository, issue, body)], legacy: true };
}

export { recordLegacyDelivery };
