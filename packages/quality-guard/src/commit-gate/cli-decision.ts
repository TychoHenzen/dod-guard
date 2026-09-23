import type { CheckOptions } from "./check-options.js";
import {
  acknowledgementRecords,
  affectedPaths,
  noSourceDecision,
  refactorMapFor,
  type SnapshotInput,
  sourceInventories,
} from "./cli-decision-input.js";
import {
  scannerEvidence,
  snapshotConfig,
  sourceChange,
  withoutDistributionChanges,
} from "./cli-tree.js";
import { parseQualityConfig } from "./config.js";
import { decideQuality } from "./decision-core.js";
import { readQualityDecisionNotes } from "./quality-decision-notes.js";
import {
  readCommittedSnapshot,
  readStagedSnapshot,
  type Snapshot,
} from "./snapshot.js";
import type { DecisionResult } from "./types.js";

function decisionWithSources(
  input: SnapshotInput,
  snapshot: Snapshot,
  changed: string[],
  trackedAcknowledgements: ReturnType<typeof acknowledgementRecords>,
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
    pendingAcknowledgementRecords:
      input.targetRef === "index" ? trackedAcknowledgements : [],
    attestations: snapshot.targetCommitSha
      ? readQualityDecisionNotes(input.root, snapshot.targetCommitSha)
      : [],
    refactorMap: refactorMapFor(input),
  });
}

function decisionForSnapshot(input: SnapshotInput): DecisionResult {
  const snapshot = withoutDistributionChanges(input.snapshot);
  const changed = affectedPaths(snapshot);
  const trackedAcknowledgements = acknowledgementRecords(input);
  if (!changed.some(sourceChange)) return noSourceDecision(snapshot);
  return decisionWithSources(input, snapshot, changed, trackedAcknowledgements);
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
  options: CheckOptions & {
    snapshotReader?: (
      root: string,
      commit: string,
    ) => ReturnType<typeof readCommittedSnapshot>;
  },
): DecisionResult {
  const { snapshotReader = readCommittedSnapshot, ...checkOptions } = options;
  const snapshot = snapshotReader(root, commit);
  return decisionForSnapshot({
    root,
    snapshot,
    baseRef: snapshot.baseIdentity,
    targetRef: snapshot.targetCommitSha,
    options: checkOptions,
    skipStructural: process.env.QUALITY_GUARD_SKIP_STRUCTURAL === "1",
  });
}
