import {
  parseArchitectureAcknowledgements as parseAcknowledgements,
} from "./acknowledgements.js";
import type { CheckOptions } from "./check-options.js";
import { parseQualityConfig } from "./config.js";
import { decideQuality } from "./decision-core.js";
import { extractFactInventory } from "./facts.js";
import { DECISION_RECORD_PATH } from "./fingerprint.js";
import { parseResponsibilityMap } from "./responsibility-map.js";
import { readSourceInventory, type Snapshot } from "./snapshot.js";
import type { DecisionResult } from "./types.js";
import { treeFile } from "./cli-tree.js";

export function affectedPaths(snapshot: Snapshot): string[] {
  return snapshot.changes
    .flatMap((change) => [change.before?.path, change.after?.path])
    .filter((filePath): filePath is string => Boolean(filePath));
}

export function noSourceDecision(snapshot: Snapshot): DecisionResult {
  return decideQuality({
    snapshot,
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: { findings: [] },
  });
}

export function acknowledgementRecords(root: string, ref: string) {
  return parseAcknowledgements(
    treeFile({ root, ref, filePath: DECISION_RECORD_PATH, fallback: "[]" }),
  );
}

export function refactorMapFor(input: {
  root: string;
  targetRef: string;
  options: CheckOptions;
}): ReturnType<typeof parseResponsibilityMap> | undefined {
  if (input.options.intent !== "refactor" || !input.options.target)
    return undefined;
  return parseResponsibilityMap(
    treeFile({
      root: input.root,
      ref: input.targetRef,
      filePath: input.options.target,
    }),
  );
}

export function sourceInventories(input: {
  root: string;
  baseRef: string;
  targetRef: string;
  changed: string[];
}) {
  return {
    before: extractFactInventory(
      readSourceInventory(input.root, input.baseRef),
      input.changed,
    ),
    after: extractFactInventory(
      readSourceInventory(input.root, input.targetRef),
      input.changed,
    ),
  };
}
