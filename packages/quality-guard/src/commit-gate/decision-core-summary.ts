import type { Snapshot } from "./snapshot.js";
import type { DecisionResult } from "./types.js";
import { isSourcePath } from "./snapshot-types.js";

const QUALITY_CONFIGURATION_PATH = ".quality-guard.json";

function changedPaths(snapshot: Snapshot): string[] {
  const paths = snapshot.changes.flatMap((change) => [
    change.before?.path,
    change.after?.path,
  ]);
  return [
    ...new Set(paths.filter((path): path is string => Boolean(path))),
  ].sort((left, right) => left.localeCompare(right));
}

export function changedSourcePaths(snapshot: Snapshot): string[] {
  return changedPaths(snapshot).filter(isSourcePath);
}

export function requiresSourceDecision(snapshot: Snapshot): boolean {
  return changedPaths(snapshot).some(
    (filePath) =>
      isSourcePath(filePath) || filePath === QUALITY_CONFIGURATION_PATH,
  );
}

export function summaryFor(snapshot: Snapshot, changedSourcePaths: string[]) {
  return {
    baseIdentity: snapshot.baseIdentity,
    targetIdentity: snapshot.targetIdentity,
    changedSourcePaths,
  };
}

export function noDecision(
  summary: ReturnType<typeof summaryFor>,
): DecisionResult {
  return {
    verdict: "PASS",
    findings: [],
    errors: [],
    input: {
      ...summary,
      reason:
        "No source quality decision was required because the staged change " +
        "contains no supported source or quality configuration.",
    },
  };
}
