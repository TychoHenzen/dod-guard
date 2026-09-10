import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { appendArchitectureAcknowledgement } from "./acknowledgements.js";
import type { AcknowledgeOptions } from "./acknowledge-options.js";
import type { CommandResult } from "./command-result.js";
import {
  acknowledgeUsage,
  parseAcknowledgeArguments,
} from "./cli-arguments.js";
import { runStagedCheck } from "./cli-decision.js";
import { DECISION_RECORD_PATH } from "./fingerprint.js";

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
      `finding ${options.findingId} is deterministic and ` +
        "cannot be acknowledged",
    );
  if (!decision.fingerprint)
    return acknowledgeUsage(
      "no current staged source fingerprint is available",
    );
  return { fingerprint: decision.fingerprint };
}

function writeAcknowledgement(
  root: string,
  options: AcknowledgeOptions,
  fingerprint: string,
): CommandResult {
  const recordPath = path.join(root, DECISION_RECORD_PATH);
  mkdirSync(path["dirname"](recordPath), { recursive: true });
  writeFileSync(
    recordPath,
    appendArchitectureAcknowledgement(acknowledgementSource(recordPath), {
      ...options,
      fingerprint,
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
    const match = findAcknowledgement(
      runStagedCheck(root, { json: false, intent: "change" }),
      options,
    );
    if ("exitCode" in match) return match;
    return writeAcknowledgement(root, options, match.fingerprint);
  } catch (error) {
    return acknowledgeUsage(
      error instanceof Error ? error.message : String(error),
    );
  }
}
