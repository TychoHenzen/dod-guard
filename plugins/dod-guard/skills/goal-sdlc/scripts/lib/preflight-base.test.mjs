import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBaseCheckpoint,
  planBaseSynchronization,
} from "./preflight-checkpoint.mjs";

const HEAD_SHA = "head-730";
const BASE_SHA = "base-730";

function baseCheckpoint({
  baseSha = BASE_SHA,
  branchHeadSha = HEAD_SHA,
  mergeable = true,
  acceptanceHeadSha,
} = {}) {
  return evaluateBaseCheckpoint({
    expected: { baseRef: "master", baseSha: BASE_SHA, headSha: HEAD_SHA },
    observed: {
      baseRef: "master",
      baseSha,
      headSha: HEAD_SHA,
      branchHeadSha,
      mergeable,
    },
    acceptanceHeadSha,
  });
}

test("base checkpoint passes only when base, branch, PR head, and mergeability agree", () => {
  const checkpoint = baseCheckpoint({ acceptanceHeadSha: HEAD_SHA });
  assert.deepEqual(checkpoint, {
    state: "stable",
    valid: true,
    invalidatesAcceptance: false,
    recoveryOwner: null,
    reasons: [],
    expected: { baseRef: "master", baseSha: BASE_SHA, headSha: HEAD_SHA },
    observed: {
      baseRef: "master",
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      branchHeadSha: HEAD_SHA,
    },
  });
});

test("base advancement invalidates old evidence and permits one guarded synchronization", () => {
  const checkpoint = baseCheckpoint({ baseSha: "new-base" });
  assert.equal(checkpoint.state, "base-drift");
  assert.equal(checkpoint.invalidatesAcceptance, true);
  assert.equal(checkpoint.recoveryOwner, "complete-pr");
  assert.deepEqual(planBaseSynchronization(checkpoint), {
    kind: "synchronize",
    owner: "complete-pr",
    previousHead: HEAD_SHA,
    baseSha: "new-base",
    invalidatesAcceptance: true,
  });
  assert.equal(
    planBaseSynchronization(checkpoint, { attempts: 1 }).code,
    "base_synchronization_unavailable",
  );
});

test("conflicts and unexpected branch movement stop before review, merge, or cleanup", () => {
  const conflict = baseCheckpoint({ mergeable: "CONFLICTING" });
  assert.equal(conflict.state, "conflict");
  assert.equal(planBaseSynchronization(conflict).code, "merge_conflict");

  const movedBranch = baseCheckpoint({ branchHeadSha: "unexpected-head" });
  assert.equal(movedBranch.state, "head-drift");
  assert.equal(planBaseSynchronization(movedBranch).code, "unexpected_head_change");
});
