import type { Snapshot } from "./snapshot.js";
import type { DecisionResult } from "./types.js";

const SOURCE_PATH = new RegExp(
  String.raw`\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|cs|rs|py|go|java|kt|kts|c|` +
    String.raw`cc|cpp|` +
    String.raw`cxx|h|hpp)$`,
  "i",
);
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
  return changedPaths(snapshot).filter((filePath) =>
    SOURCE_PATH.test(filePath),
  );
}

export function requiresSourceDecision(snapshot: Snapshot): boolean {
  return changedPaths(snapshot).some(
    (filePath) =>
      SOURCE_PATH.test(filePath) || filePath === QUALITY_CONFIGURATION_PATH,
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
