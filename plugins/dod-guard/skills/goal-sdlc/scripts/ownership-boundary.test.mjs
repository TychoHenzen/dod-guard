import assert from "node:assert/strict";
import test from "node:test";

const CHECKPOINT = Object.freeze({
  repository: "TychoHenzen/dod-guard",
  parentIssue: 733,
  childIssue: 793,
  branch: "codex/733-friction-log-2026-10-01",
  head: "checkpoint-head",
  responsibility: "implementation",
  handoffRevision: 1,
});

const logicalScopeFields = [
  "repository",
  "parentIssue",
  "childIssue",
  "branch",
  "responsibility",
];

const evidenceFields = [
  "head",
  "handoffRevision",
];

const identityFields = [
  ...logicalScopeFields,
  ...evidenceFields,
];

function owner(handle, overrides = {}) {
  return { ...CHECKPOINT, handle, active: true, ...overrides };
}

function hasCompleteIdentity(value) {
  return value?.active === true
    && typeof value.handle === "string"
    && value.handle.length > 0
    && identityFields.every((field) => value[field] !== undefined && value[field] !== null);
}

function sameScope(left, right) {
  return identityFields.every((field) => left?.[field] === right?.[field]);
}

function sameLogicalScope(left, right) {
  return logicalScopeFields.every((field) => left?.[field] === right?.[field]);
}

function assessOwnership({ currentOwner = null, peers = [], observed = CHECKPOINT } = {}) {
  const activePeers = peers.filter((peer) => peer?.active === true);
  const matchingPeers = activePeers.filter((peer) => hasCompleteIdentity(peer) && sameScope(peer, observed));
  const stalePeers = activePeers.filter(
    (peer) => hasCompleteIdentity(peer) && sameLogicalScope(peer, observed) && !sameScope(peer, observed),
  );
  const incompletePeers = activePeers.filter((peer) => !hasCompleteIdentity(peer));

  if (stalePeers.length > 0) {
    return {
      decision: "hold",
      reason: "stale peer conflict",
      recoveryOwner: stalePeers[0].handle,
      effects: [],
    };
  }
  if (matchingPeers.length > 1) {
    return { decision: "hold", reason: "conflicting owners", effects: [] };
  }
  if (matchingPeers.length === 1) {
    return { decision: "wait", canonicalOwner: matchingPeers[0].handle, effects: [] };
  }
  if (incompletePeers.length > 0) {
    return { decision: "hold", reason: "missing owner evidence", effects: [] };
  }
  if (currentOwner === null) {
    return { decision: "claim", canonicalOwner: "self", effects: [] };
  }
  if (!(hasCompleteIdentity(currentOwner) && sameScope(currentOwner, observed))) {
    return { decision: "stale", recoveryOwner: currentOwner.handle ?? null, effects: [] };
  }
  return { decision: "proceed", canonicalOwner: currentOwner.handle, effects: [] };
}

function observeThenClaim({ peersAtObservation = [], peersAtClaim = [] } = {}) {
  const observation = assessOwnership({ peers: peersAtObservation });
  if (observation.decision !== "claim") {
    return observation;
  }
  return assessOwnership({ currentOwner: owner("self"), peers: peersAtClaim });
}

test("sole ownership claims one exact checkpoint before dispatch", () => {
  assert.deepEqual(assessOwnership(), {
    decision: "claim",
    canonicalOwner: "self",
    effects: [],
  });
});

test("a matching peer is canonical and the waiting mutation list stays empty", () => {
  assert.deepEqual(assessOwnership({ peers: [owner("peer-goal")] }), {
    decision: "wait",
    canonicalOwner: "peer-goal",
    effects: [],
  });
});

test("duplicate owners fail closed without a second dispatch", () => {
  assert.deepEqual(
    assessOwnership({ peers: [owner("first-peer"), owner("second-peer")] }),
    { decision: "hold", reason: "conflicting owners", effects: [] },
  );
});

test("a stale peer head is a conflict instead of permission to claim", () => {
  assert.deepEqual(
    assessOwnership({ peers: [owner("stale-peer", { head: "newer-head" })] }),
    {
      decision: "hold",
      reason: "stale peer conflict",
      recoveryOwner: "stale-peer",
      effects: [],
    },
  );
});

test("a stale handoff revision is a conflict instead of permission to claim", () => {
  assert.deepEqual(
    assessOwnership({ peers: [owner("stale-peer", { handoffRevision: 2 })] }),
    {
      decision: "hold",
      reason: "stale peer conflict",
      recoveryOwner: "stale-peer",
      effects: [],
    },
  );
});

test("a peer appearing between observation and claim fails closed", () => {
  assert.deepEqual(
    observeThenClaim({ peersAtClaim: [owner("race-peer")] }),
    { decision: "wait", canonicalOwner: "race-peer", effects: [] },
  );
  assert.deepEqual(
    observeThenClaim({ peersAtClaim: [owner("race-peer", { head: "newer-head" })] }),
    {
      decision: "hold",
      reason: "stale peer conflict",
      recoveryOwner: "race-peer",
      effects: [],
    },
  );
});

test("an exact peer alongside stale evidence still fails closed", () => {
  assert.deepEqual(
    assessOwnership({ peers: [owner("current-peer"), owner("stale-peer", { handoffRevision: 2 })] }),
    {
      decision: "hold",
      reason: "stale peer conflict",
      recoveryOwner: "stale-peer",
      effects: [],
    },
  );
});

test("peer mutation makes an existing handoff stale", () => {
  assert.deepEqual(
    assessOwnership({
      currentOwner: owner("self"),
      observed: { ...CHECKPOINT, head: "changed-head" },
    }),
    { decision: "stale", recoveryOwner: "self", effects: [] },
  );
});

test("missing owner evidence fails closed with no local mutation", () => {
  assert.deepEqual(
    assessOwnership({ peers: [{ active: true, handle: "peer-goal" }] }),
    { decision: "hold", reason: "missing owner evidence", effects: [] },
  );
});
