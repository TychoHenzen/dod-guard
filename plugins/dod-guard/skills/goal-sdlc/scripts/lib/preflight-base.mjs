import { firstText, text } from "./preflight-values.mjs";

function checkpointIdentity(expected = {}, observed = {}, acceptanceHeadSha) {
  return {
    expected: {
      baseRef: firstText(expected.baseRef),
      baseSha: firstText(expected.baseSha),
      headSha: firstText(expected.headSha, acceptanceHeadSha),
    },
    observed: {
      baseRef: firstText(observed.baseRef),
      baseSha: firstText(observed.baseSha),
      headSha: firstText(observed.headSha),
      branchHeadSha: firstText(observed.branchHeadSha, observed.branch?.sha),
    },
  };
}

function requiredIdentityReasons(identity) {
  const { expected, observed } = identity;
  const expectedMissing = Object.values(expected).some((value) => value === null);
  const observedMissing = Object.values(observed).some((value) => value === null);
  return [
    ...(expectedMissing ? ["expected base ref, base SHA, and pushed head are required"] : []),
    ...(observedMissing ? ["observed PR base, branch head, and PR head are required"] : []),
  ];
}

function baseRefDrift(identity) {
  const { expected, observed } = identity;
  return expected.baseRef !== null
    && observed.baseRef !== null
    && expected.baseRef !== observed.baseRef
    ? [`base ref changed from ${expected.baseRef} to ${observed.baseRef}`]
    : [];
}

function baseShaDrift(identity) {
  const { expected, observed } = identity;
  return expected.baseSha !== null
    && observed.baseSha !== null
    && expected.baseSha !== observed.baseSha
    ? [`base SHA advanced from ${expected.baseSha} to ${observed.baseSha}`]
    : [];
}

function headDrift(identity) {
  const { expected, observed } = identity;
  return expected.headSha !== null
    && observed.headSha !== null
    && expected.headSha !== observed.headSha
    ? [`PR head changed from ${expected.headSha} to ${observed.headSha}`]
    : [];
}

function acceptanceHeadDrift(identity, acceptanceHeadSha) {
  const expectedHead = identity.expected.headSha;
  const acceptanceHead = text(acceptanceHeadSha);
  if (acceptanceHead === null) {
    return ["independently supplied acceptance head is required"];
  }
  return expectedHead !== null
    && expectedHead !== acceptanceHead
    ? [`acceptance head changed from ${expectedHead} to ${acceptanceHead}`]
    : [];
}

function branchHeadDrift(identity) {
  const { observed } = identity;
  return observed.headSha !== null
    && observed.branchHeadSha !== null
    && observed.headSha !== observed.branchHeadSha
    ? [`branch head ${observed.branchHeadSha} differs from PR head ${observed.headSha}`]
    : [];
}

function identityDriftReasons(identity, acceptanceHeadSha) {
  return [
    ...baseRefDrift(identity),
    ...baseShaDrift(identity),
    ...headDrift(identity),
    ...acceptanceHeadDrift(identity, acceptanceHeadSha),
    ...branchHeadDrift(identity),
  ];
}

function conflictDetected(observed) {
  return [
    observed.mergeable === false,
    String(observed.mergeable ?? "").toUpperCase() === "CONFLICTING",
    String(observed.mergeState ?? "").toUpperCase() === "DIRTY",
    observed.conflict === true,
  ].some(Boolean);
}

function mergeabilityFailure(observed) {
  const mergeable = String(observed.mergeable ?? "").toUpperCase();
  const mergeState = String(observed.mergeState ?? "").toUpperCase();
  if (conflictDetected(observed)) {
    return "pull request reports merge conflict";
  }
  if (observed.mergeable === true || mergeable === "MERGEABLE" || mergeState === "CLEAN") {
    return null;
  }
  return "pull request mergeability is unavailable";
}

function checkpointState(reasons, conflict) {
  if (conflict) {
    return "conflict";
  }
  if (reasons.some((reason) => /PR head changed|branch head .*differs|acceptance head changed/.test(reason))) {
    return "head-drift";
  }
  if (reasons.some((reason) => reason.includes("base"))) {
    return "base-drift";
  }
  return reasons.length === 0 ? "stable" : "unavailable";
}

export function evaluateBaseCheckpoint({ expected = {}, observed = {}, acceptanceHeadSha } = {}) {
  const identity = checkpointIdentity(expected, observed, acceptanceHeadSha);
  const reasons = [
    ...requiredIdentityReasons(identity),
    ...identityDriftReasons(identity, acceptanceHeadSha),
  ];
  const mergeabilityReason = mergeabilityFailure(observed);
  const conflict = mergeabilityReason === "pull request reports merge conflict";
  if (mergeabilityReason !== null) {
    reasons.push(mergeabilityReason);
  }
  const state = checkpointState(reasons, conflict);
  return {
    state,
    valid: state === "stable",
    invalidatesAcceptance: state !== "stable",
    recoveryOwner: state === "base-drift" ? "complete-pr" : null,
    reasons,
    expected: identity.expected,
    observed: identity.observed,
  };
}

export function planBaseSynchronization(checkpoint, { attempts = 0 } = {}) {
  if (checkpoint?.state === "stable") {
    return { kind: "none", reason: "base and head evidence are stable" };
  }
  if (checkpoint?.state === "base-drift" && attempts === 0) {
    return {
      kind: "synchronize",
      owner: "complete-pr",
      previousHead: checkpoint.observed.headSha,
      baseSha: checkpoint.observed.baseSha,
      invalidatesAcceptance: true,
    };
  }
  const codes = {
    conflict: "merge_conflict",
    "head-drift": "unexpected_head_change",
  };
  return {
    kind: "stop",
    code: codes[checkpoint?.state] ?? "base_synchronization_unavailable",
    reasons: checkpoint?.reasons ?? ["base checkpoint is unavailable"],
  };
}
