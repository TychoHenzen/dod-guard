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

const scopeFields = [
  "repository",
  "parentIssue",
  "childIssue",
  "branch",
  "head",
  "responsibility",
  "handoffRevision",
];

function owner(handle, overrides = {}) {
  return { ...CHECKPOINT, handle, active: true, ...overrides };
}

function hasCompleteIdentity(value) {
  return value?.active === true
    && typeof value.handle === "string"
    && value.handle.length > 0
    && scopeFields.every((field) => value[field] !== undefined && value[field] !== null);
}

function sameScope(left, right) {
  return scopeFields.every((field) => left?.[field] === right?.[field]);
}

function assessOwnership({ currentOwner = null, peers = [], observed = CHECKPOINT } = {}) {
  const activePeers = peers.filter((peer) => peer?.active === true);
  const matchingPeers = activePeers.filter((peer) => hasCompleteIdentity(peer) && sameScope(peer, observed));
  const incompletePeers = activePeers.filter((peer) => !hasCompleteIdentity(peer));

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
