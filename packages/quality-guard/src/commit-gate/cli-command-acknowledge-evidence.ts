import type { AcknowledgeOptions } from "./acknowledge-options.js";
import { runCommittedCheck } from "./cli-decision.js";
import { acknowledgeUsage } from "./cli-usage.js";
import type { CommandResult } from "./command-result.js";
import { writeQualityDecisionNote } from "./quality-decision-notes.js";
import type { DecisionResult } from "./types.js";

function currentReviewFinding(
  findings: DecisionResult["findings"],
  findingId: string,
) {
  const finding = findings.find((item) => item.id === findingId);
  if (!finding)
    return acknowledgeUsage(`unknown or stale finding ${findingId}`);
  if (finding.severity !== "review")
    return acknowledgeUsage(
      `finding ${findingId} is deterministic and cannot be acknowledged`,
    );
  return finding;
}

export function findStagedAcknowledgement(
  decision: DecisionResult,
  options: AcknowledgeOptions,
) {
  const finding = currentReviewFinding(decision.findings, options.findingId);
  if ("exitCode" in finding) return finding;
  if (!decision.fingerprint)
    return acknowledgeUsage(
      "no current staged source fingerprint is available",
    );
  return {
    fingerprint: decision.fingerprint,
    baseIdentity: decision.input.baseIdentity,
    targetIdentity: decision.input.targetIdentity,
  };
}

function committedDecision(root: string, committedRef: string) {
  const decision = runCommittedCheck(root, committedRef, {
    json: false,
    intent: "change",
  });
  const targetSha = decision.input.targetCommitSha;
  if (!targetSha)
    throw new Error("committed snapshot did not resolve to a commit SHA");
  return {
    targetSha,
    decision,
  };
}

export function runCommittedAcknowledgement(
  root: string,
  options: AcknowledgeOptions & { committedRef: string },
): CommandResult {
  const { targetSha, decision } = committedDecision(root, options.committedRef);
  const finding = currentReviewFinding(decision.findings, options.findingId);
  if ("exitCode" in finding) return finding;
  if (!(decision.fingerprint && decision.input.baseIdentity))
    return acknowledgeUsage(
      "no current committed source fingerprint is available",
    );
  writeQualityDecisionNote(root, {
    findingId: finding.id,
    fingerprint: decision.fingerprint,
    baseSha: decision.input.baseIdentity,
    targetSha,
    reason: options.reason,
    author: options.author,
    time: new Date().toISOString(),
  });
  return {
    exitCode: 0,
    output:
      `Attested review finding ${finding.id} for ${targetSha} in ` +
      "refs/notes/quality-decisions; run `git push origin refs/notes/quality-decisions` before CI replay.",
  };
}
