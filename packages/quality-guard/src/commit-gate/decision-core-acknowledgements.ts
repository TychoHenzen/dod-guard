import type { DecisionCoreInput } from "./decision-core-types.js";
import type { Snapshot } from "./snapshot.js";
import type { DecisionResult } from "./types.js";

function matchesPendingIntent(
  record: NonNullable<
    DecisionCoreInput["pendingAcknowledgementRecords"]
  >[number],
  snapshot: Snapshot,
  fingerprint: string,
) {
  return (
    record.fingerprint === fingerprint &&
    record.baseIdentity === snapshot.baseIdentity &&
    record.targetIdentity === snapshot.targetIdentity
  );
}

function matchesAttestation(
  record: NonNullable<DecisionCoreInput["attestations"]>[number],
  snapshot: Snapshot,
  fingerprint: string,
) {
  return (
    record.fingerprint === fingerprint &&
    record.baseSha === snapshot.baseIdentity &&
    record.targetSha === snapshot.targetCommitSha
  );
}

export function acceptedFindings(
  input: DecisionCoreInput,
  fingerprint: string,
) {
  const {
    pendingAcknowledgementRecords = [],
    attestations = [],
    acknowledgements = [],
  } = input;
  const pending = pendingAcknowledgementRecords.filter((record) =>
    matchesPendingIntent(record, input.snapshot, fingerprint),
  );
  const current = attestations.filter((record) =>
    matchesAttestation(record, input.snapshot, fingerprint),
  );
  return new Set([
    ...acknowledgements,
    ...pending.map((record) => record.findingId),
    ...current.map((record) => record.findingId),
  ]);
}

export function staleAcknowledgements(
  input: DecisionCoreInput,
  fingerprint: string,
  findings: DecisionResult["findings"],
): NonNullable<DecisionResult["staleAcknowledgements"]> {
  const currentFindingIds = new Set(findings.map(({ id }) => id));
  const pending = (input.pendingAcknowledgementRecords ?? [])
    .filter(
      (record) =>
        currentFindingIds.has(record.findingId) &&
        !matchesPendingIntent(record, input.snapshot, fingerprint),
    )
    .map(({ findingId, baseIdentity, targetIdentity }) => ({
      findingId,
      baseIdentity,
      targetIdentity,
    }));
  const attestations = (input.attestations ?? [])
    .filter(
      (record) =>
        currentFindingIds.has(record.findingId) &&
        !matchesAttestation(record, input.snapshot, fingerprint),
    )
    .map(({ findingId, baseSha, targetSha }) => ({
      findingId,
      baseIdentity: baseSha,
      targetIdentity: targetSha,
    }));
  return [...pending, ...attestations].sort((left, right) =>
    left.findingId.localeCompare(right.findingId),
  );
}
