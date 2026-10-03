import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRequiredContextMatrix,
  planDraftWorkflowDispatch,
  validateRequiredContextMatrix,
  validateWorkflowDispatchReadback,
} from "./preflight-checkpoint.mjs";

const HEAD_SHA = "head-730";
const REPOSITORY = "TychoHenzen/dod-guard";
const REF = "codex/730-friction-log-2026-09-30";
const REQUIRED_CONTEXTS = [
  { name: "build-test", provider: "github-actions", workflow: "ci.yml" },
  { name: "codeql-python", provider: "github-actions", workflow: "codeql.yml" },
];

function observation(name, state = "success", overrides = {}) {
  return {
    name,
    provider: "github-actions",
    workflow: name === "codeql-python" ? "codeql.yml" : "ci.yml",
    runId: `${name}-run`,
    ref: REF,
    headSha: HEAD_SHA,
    state,
    ...overrides,
  };
}

function completeMatrix(overrides = {}) {
  return buildRequiredContextMatrix({
    requiredContexts: REQUIRED_CONTEXTS,
    observations: [observation("build-test"), observation("codeql-python")],
    headSha: HEAD_SHA,
    ...overrides,
  });
}

function pullRequest(overrides = {}) {
  return {
    state: "OPEN",
    repository: REPOSITORY,
    headRef: REF,
    headSha: HEAD_SHA,
    ...overrides,
  };
}

function readiness(overrides = {}) {
  return {
    read: true,
    isDraft: true,
    repository: REPOSITORY,
    ref: REF,
    headSha: HEAD_SHA,
    ...overrides,
  };
}

test("builds and validates one exact-head row for every required context state", () => {
  for (const state of ["success", "pending", "failure", "skipped"]) {
    const matrix = buildRequiredContextMatrix({
      requiredContexts: [{ name: "build-test", provider: "github-actions", workflow: "ci.yml" }],
      observations: [observation("build-test", state)],
      headSha: HEAD_SHA,
    });
    assert.equal(matrix.rows[0].state, state === "success" ? "present" : state === "failure" ? "failed" : state);
    assert.equal(matrix.rows[0].headSha, HEAD_SHA);
    assert.equal(matrix.rows[0].workflow, "ci.yml");
    assert.equal(matrix.rows[0].ref, REF);
  }

  const unavailable = buildRequiredContextMatrix({
    requiredContexts: REQUIRED_CONTEXTS,
    observations: [observation("build-test")],
    headSha: HEAD_SHA,
  });
  assert.equal(unavailable.rows[1].state, "unavailable");
  assert.match(unavailable.rows[1].reason, /not returned/);
  assert.deepEqual(
    [...new Set(unavailable.rows.map(({ state }) => state))],
    ["present", "unavailable"],
  );
});

test("required-context validation rejects missing, stale, duplicate, and non-present evidence", () => {
  const matrix = completeMatrix();
  assert.equal(
    validateRequiredContextMatrix({
      matrix,
      requiredContexts: REQUIRED_CONTEXTS,
      headSha: HEAD_SHA,
    }).valid,
    true,
  );

  const stale = completeMatrix({
    observations: [observation("build-test", "success", { headSha: "old-head" }), observation("codeql-python")],
  });
  const staleResult = validateRequiredContextMatrix({
    matrix: stale,
    requiredContexts: REQUIRED_CONTEXTS,
    headSha: HEAD_SHA,
  });
  assert.equal(staleResult.valid, false);
  assert.ok(staleResult.errors.some((error) => error.includes("unavailable")));

  const pending = completeMatrix({
    observations: [observation("build-test", "pending"), observation("codeql-python")],
  });
  const pendingResult = validateRequiredContextMatrix({
    matrix: pending,
    requiredContexts: REQUIRED_CONTEXTS,
    headSha: HEAD_SHA,
  });
  assert.equal(pendingResult.valid, false);
  assert.ok(pendingResult.errors.includes("required context build-test is pending"));

  const duplicate = {
    rows: [...matrix.rows, { ...matrix.rows[0] }],
  };
  const duplicateResult = validateRequiredContextMatrix({
    matrix: duplicate,
    requiredContexts: REQUIRED_CONTEXTS,
    headSha: HEAD_SHA,
  });
  assert.equal(duplicateResult.valid, false);
  assert.ok(duplicateResult.errors.includes("required context build-test has duplicate rows"));
});

test("draft-skipped context plans one exact-ref dispatch after readiness readback", () => {
  const matrix = completeMatrix({
    observations: [observation("build-test"), observation("codeql-python", "skipped")],
  });
  const plan = planDraftWorkflowDispatch({
    matrix,
    pullRequest: pullRequest(),
    readiness: readiness(),
  });

  assert.deepEqual(plan, {
    kind: "dispatch",
    workflow: "codeql.yml",
    repository: REPOSITORY,
    ref: REF,
    headSha: HEAD_SHA,
    dispatchKey: `${REPOSITORY}:${REF}@${HEAD_SHA}:codeql.yml`,
    invalidatesAcceptance: true,
  });
});

test("dispatch readback records run, workflow, ref, and exact head evidence", () => {
  const matrix = completeMatrix({
    observations: [observation("build-test"), observation("codeql-python", "skipped")],
  });
  const plan = planDraftWorkflowDispatch({ matrix, pullRequest: pullRequest(), readiness: readiness() });
  const result = validateWorkflowDispatchReadback({
    plan,
    run: {
      workflow: "codeql.yml",
      runId: 73001,
      repository: REPOSITORY,
      ref: REF,
      headSha: HEAD_SHA,
      state: "queued",
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.evidence, {
    workflow: "codeql.yml",
    runId: "73001",
    repository: REPOSITORY,
    ref: REF,
    headSha: HEAD_SHA,
    state: "pending",
  });
});

test("duplicate dispatch, unavailable readiness, and provider failure stop without a mutation plan", () => {
  const matrix = completeMatrix({
    observations: [observation("build-test"), observation("codeql-python", "skipped")],
  });
  const dispatchKey = `${REPOSITORY}:${REF}@${HEAD_SHA}:codeql.yml`;
  assert.equal(
    planDraftWorkflowDispatch({
      matrix,
      pullRequest: pullRequest(),
      readiness: readiness(),
      dispatchedRefs: [dispatchKey],
    }).code,
    "duplicate_workflow_dispatch",
  );
  assert.equal(
    planDraftWorkflowDispatch({ matrix, pullRequest: pullRequest(), readiness: readiness({ isDraft: false }) }).code,
    "readiness_readback_missing",
  );
  assert.equal(
    planDraftWorkflowDispatch({
      matrix: { rows: [{ ...matrix.rows[0], state: "failed" }, { ...matrix.rows[1], state: "unavailable" }] },
      pullRequest: pullRequest(),
      readiness: readiness(),
    }).code,
    "required_contexts_not_ready",
  );
  assert.equal(
    planDraftWorkflowDispatch({
      matrix: {
        rows: [{ ...matrix.rows[0], state: "failed" }, matrix.rows[1]],
      },
      pullRequest: pullRequest(),
      readiness: readiness(),
    }).code,
    "required_contexts_not_ready",
  );
});

test("dispatch readback rejects stale or mismatched provider evidence", () => {
  const matrix = completeMatrix({
    observations: [observation("build-test"), observation("codeql-python", "skipped")],
  });
  const plan = planDraftWorkflowDispatch({ matrix, pullRequest: pullRequest(), readiness: readiness() });
  const result = validateWorkflowDispatchReadback({
    plan,
    run: {
      workflow: "codeql.yml",
      runId: "73001",
      repository: REPOSITORY,
      ref: REF,
      headSha: "old-head",
      state: "success",
    },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("workflow dispatch headSha changed during readback"));
});
