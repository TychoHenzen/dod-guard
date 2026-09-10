import type { CheckOptions } from "./check-options.js";
import { parseQualityConfig } from "./config.js";
import { decideQuality } from "./decision-core.js";
import {
  readCommittedSnapshot,
  readStagedSnapshot,
  type Snapshot,
} from "./snapshot.js";
import type { DecisionResult } from "./types.js";
import {
  scannerEvidence,
  snapshotConfig,
  sourceChange,
  withoutDistributionChanges,
} from "./cli-tree.js";
import {
  acknowledgementRecords,
  affectedPaths,
  noSourceDecision,
  refactorMapFor,
  sourceInventories,
} from "./cli-decision-input.js";

type SnapshotInput = {
  root: string;
  snapshot: Snapshot;
  baseRef: string;
  targetRef: string;
  options: CheckOptions;
  skipStructural?: boolean;
};

function decisionWithSources(
  input: SnapshotInput,
  snapshot: Snapshot,
  changed: string[],
): DecisionResult {
  const config = parseQualityConfig(
    snapshotConfig(input.root, input.targetRef),
  );
  const { before, after } = sourceInventories({ ...input, changed });
  return decideQuality({
    snapshot,
    config,
    beforeFiles: before.files,
    afterFiles: after.files,
    analysisErrors: [...before.errors, ...after.errors],
    scanner: input.skipStructural
      ? { findings: [] }
      : scannerEvidence(input.root, input.targetRef),
    acknowledgementRecords: acknowledgementRecords(input.root, input.targetRef),
    refactorMap: refactorMapFor(input),
  });
}

function decisionForSnapshot(input: SnapshotInput): DecisionResult {
  const snapshot = withoutDistributionChanges(input.snapshot);
  const changed = affectedPaths(snapshot);
  if (!changed.some(sourceChange)) return noSourceDecision(snapshot);
  return decisionWithSources(input, snapshot, changed);
}

export function runStagedCheck(
  root: string,
  options: CheckOptions,
): DecisionResult {
  return decisionForSnapshot({
    root,
    snapshot: readStagedSnapshot(root),
    baseRef: "HEAD",
    targetRef: "index",
    options,
  });
}

export function runCommittedCheck(
  root: string,
  commit: string,
  options: CheckOptions,
): DecisionResult {
  return decisionForSnapshot({
    root,
    snapshot: readCommittedSnapshot(root, commit),
    baseRef: `${commit}^`,
    targetRef: commit,
    options,
    skipStructural: process.env.QUALITY_GUARD_SKIP_STRUCTURAL === "1",
  });
}
