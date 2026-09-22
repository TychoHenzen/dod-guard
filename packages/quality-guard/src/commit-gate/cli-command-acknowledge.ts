import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { AcknowledgeOptions } from "./acknowledge-options.js";
import {
  type ArchitectureAcknowledgement,
  appendArchitectureAcknowledgement,
} from "./acknowledgements.js";
import {
  acknowledgeUsage,
  parseAcknowledgeArguments,
} from "./cli-arguments.js";
import { runCommittedCheck, runStagedCheck } from "./cli-decision.js";
import type { CommandResult } from "./command-result.js";
import { DECISION_RECORD_PATH } from "./fingerprint.js";
import { writeQualityDecisionNote } from "./quality-decision-notes.js";

function acknowledgementSource(recordPath: string): string {
  try {
    return readFileSync(recordPath, "utf8");
  } catch {
    return "[]";
  }
}

function findAcknowledgement(
  decision: ReturnType<typeof runStagedCheck>,
  options: AcknowledgeOptions,
) {
  const finding = decision.findings.find(
    (item) => item.id === options.findingId,
  );
  if (!finding)
    return acknowledgeUsage(`unknown or stale finding ${options.findingId}`);
  if (finding.severity !== "review")
    return acknowledgeUsage(
      `finding ${options.findingId} is deterministic and cannot be acknowledged`,
    );
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

function writeAcknowledgement(
  root: string,
  options: AcknowledgeOptions,
  match: Pick<
    ArchitectureAcknowledgement,
    "fingerprint" | "baseIdentity" | "targetIdentity"
  >,
): CommandResult {
  const recordPath = path.join(root, DECISION_RECORD_PATH);
  mkdirSync(path.dirname(recordPath), { recursive: true });
  writeFileSync(
    recordPath,
    appendArchitectureAcknowledgement(acknowledgementSource(recordPath), {
      ...options,
      ...match,
      time: new Date().toISOString(),
    }),
    "utf8",
  );
  execFileSync("git", ["add", "--", DECISION_RECORD_PATH], {
    cwd: root,
    stdio: "ignore",
  });
  return {
    exitCode: 0,
    output: `Acknowledged review finding ${options.findingId}`,
  };
}

function committedAcknowledgement(
  root: string,
  options: AcknowledgeOptions & { committedRef: string },
): CommandResult {
  const targetSha = execFileSync("git", ["rev-parse", options.committedRef], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const decision = runCommittedCheck(root, targetSha, {
    json: false,
    intent: "change",
  });
  const finding = currentCommittedReviewFinding(decision, options.findingId);
  if ("exitCode" in finding) return finding;
  if (!decision.fingerprint || !decision.input.baseIdentity)
    return acknowledgeUsage("no current committed source fingerprint is available");
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

export function currentCommittedReviewFinding(
  decision: ReturnType<typeof runCommittedCheck>,
  findingId: string,
) {
  const finding = decision.findings.find((item) => item.id === findingId);
  if (!finding)
    return acknowledgeUsage(`unknown or stale finding ${findingId}`);
  if (finding.severity !== "review")
    return acknowledgeUsage(
      `finding ${findingId} is deterministic and cannot be acknowledged`,
    );
  return finding;
}

export function runAcknowledgeCommand(
  args: string[],
  root: string,
): CommandResult {
  const options = parseAcknowledgeArguments(args);
  if ("exitCode" in options) return options;
  try {
    if (options.committedRef)
      return committedAcknowledgement(root, {
        ...options,
        committedRef: options.committedRef,
      });
    const match = findAcknowledgement(
      runStagedCheck(root, { json: false, intent: "change" }),
      options,
    );
    if ("exitCode" in match) return match;
    return writeAcknowledgement(root, options, match);
  } catch (error) {
    return acknowledgeUsage(
      error instanceof Error ? error.message : String(error),
    );
  }
}
