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
import {
  findStagedAcknowledgement,
  runCommittedAcknowledgement,
} from "./cli-command-acknowledge-evidence.js";
import { runStagedCheck } from "./cli-decision.js";
import type { CommandResult } from "./command-result.js";
import { DECISION_RECORD_PATH } from "./fingerprint.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function acknowledgementSource(recordPath: string): string {
  try {
    return readFileSync(recordPath, "utf8");
  } catch {
    return "[]";
  }
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

export function runAcknowledgeCommand(
  args: string[],
  root: string,
): CommandResult {
  const options = parseAcknowledgeArguments(args);
  if ("exitCode" in options) return options;
  try {
    if (options.committedRef)
      return runCommittedAcknowledgement(root, {
        ...options,
        committedRef: options.committedRef,
      });
    const match = findStagedAcknowledgement(
      runStagedCheck(root, { json: false, intent: "change" }),
      options,
    );
    if ("exitCode" in match) return match;
    return writeAcknowledgement(root, options, match);
  } catch (error) {
    return acknowledgeUsage(errorMessage(error));
  }
}
