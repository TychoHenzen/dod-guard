import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { acceptancePhase } from "./convergence-acceptance-phase.mjs";
import {
  createLedger,
  evidenceValues,
  normalizedIdentifier,
  normalizeEntries,
  REQUIRED_RECORDS,
  REQUIRED_REVIEW_LENSES,
} from "./convergence-core.mjs";
import { lensPhase } from "./convergence-lens-phase.mjs";
import { planPhase } from "./convergence-plan-phase.mjs";
import { renderConvergence } from "./convergence-render.mjs";
import { acceptanceMatrix } from "./passing-matrix.mjs";

export const PROOF_SCENARIOS = ["passing", "incomplete", "ordinary"];

const PROOF_HANDOFF = {
  url: "https://github.com/owner/repo/issues/1#issuecomment-1",
  headSha: "abc1234",
};

const PROOF_ACCEPTANCE_MATRIX = acceptanceMatrix(PROOF_HANDOFF.headSha);

// After push the matrix must be bound to an exact head; the two checks run
// before any list is normalized, so their remainder position is pinned.
function requiresPostPush(expectedHeadSha, matrix) {
  return expectedHeadSha !== null || (matrix !== null && matrix !== undefined);
}

function postPushProblems({ expectedHeadSha, matrix }) {
  const problems = [];
  if (!expectedHeadSha) {
    problems.push("structured convergence needs an exact pushed head");
  }
  if (matrix === null) {
    problems.push("structured convergence needs an acceptance matrix");
  }
  return problems;
}

function headBinding({ headSha, acceptanceMatrix: matrix, addRemainder }) {
  const expectedHeadSha = normalizedIdentifier(headSha);
  const postPushValidation = requiresPostPush(expectedHeadSha, matrix);
  if (postPushValidation) {
    for (const problem of postPushProblems({ expectedHeadSha, matrix })) {
      addRemainder("Acceptance and verification", problem);
    }
  }
  return { expectedHeadSha, postPushValidation };
}

function recordMapOf(records) {
  if (records && typeof records === "object" && !Array.isArray(records)) {
    return records;
  }
  return {};
}

function convergenceInputs({ records, tasks, children, reviewLenses, acceptance, addRemainder }) {
  const recordMap = recordMapOf(records);
  return {
    recordMap,
    taskList: normalizeEntries({ value: tasks, label: "task", section: "Plan and tasks", addRemainder }),
    childList: normalizeEntries({
      value: children,
      label: "child",
      section: "Functional decomposition",
      addRemainder,
    }),
    lensList: normalizeEntries({
      value: reviewLenses ?? recordMap["lens-ownership"] ?? [],
      label: "review lens",
      section: "Functional decomposition",
      addRemainder,
    }),
    acceptanceList: normalizeEntries({
      value: acceptance,
      label: "acceptance criterion",
      section: "Acceptance and verification",
      addRemainder,
    }),
  };
}

function taskNextAction(task, normalizedTaskIds) {
  return {
    task: normalizedTaskIds.get(task) ?? task.id,
    owner: normalizedIdentifier(task.child) ?? "implementation",
  };
}

function convergenceNextAction({ taskList, normalizedTaskIds, remainder }) {
  const missingTask = taskList.find((task) => evidenceValues(task.evidence).length === 0);
  if (missingTask) {
    return taskNextAction(missingTask, normalizedTaskIds);
  }
  if (remainder.length > 0) {
    return { task: remainder[0], owner: "delivery owner" };
  }
  return null;
}

function convergenceOutcome(remainder) {
  if (remainder.length === 0) {
    return "verified";
  }
  return "actionable remainder";
}

function convergenceResult(ledger, nextAction) {
  return {
    outcome: convergenceOutcome(ledger.remainder),
    remainder: ledger.remainder,
    sections: ledger.sections,
    nextAction,
  };
}

export function evaluateConvergence({
  path: deliveryPath = "structured",
  records = {},
  tasks = [],
  children = [],
  reviewLenses = null,
  acceptance = [],
  acceptanceMatrix = null,
  plannedAcceptanceMatrix = null,
  headSha = null,
  contradictions = [],
}) {
  if (deliveryPath === "ordinary") {
    return { outcome: "ordinary", remainder: [] };
  }
  const ledger = createLedger();
  const { add: addRemainder, remainder } = ledger;
  const { expectedHeadSha, postPushValidation } = headBinding({ headSha, acceptanceMatrix, addRemainder });
  const inputs = convergenceInputs({ records, tasks, children, reviewLenses, acceptance, addRemainder });
  const { recordMap, taskList, childList, lensList, acceptanceList } = inputs;
  const { normalizedTaskIds, evidenceOwners } = planPhase({ recordMap, taskList, childList, addRemainder });
  const ownedLenses = lensPhase({ recordMap, lensList, taskList, normalizedTaskIds, evidenceOwners, addRemainder });
  const matrixInput = { postPushValidation, acceptanceMatrix, plannedAcceptanceMatrix, expectedHeadSha };
  acceptancePhase({ acceptanceList, evidenceOwners, taskList, lensList, ownedLenses, matrixInput, addRemainder });
  for (const contradiction of contradictions) {
    addRemainder("Acceptance and verification", contradiction);
  }
  return convergenceResult(ledger, convergenceNextAction({ taskList, normalizedTaskIds, remainder }));
}

// Lens evidence the passing proof pins by lens id. Any lens not listed here uses
// the index-numbered fallback in passingLensEvidence.
const PASSING_LENS_EVIDENCE = {
  "wiring/usability": {
    acceptance: ["evidence-2", "evidence-3"],
    verification: ["proof-2", "proof-3"],
  },
  reliability: {
    acceptance: ["evidence-4", "evidence-5"],
    verification: ["proof-4", "proof-5"],
  },
  quality: { acceptance: "evidence-6", verification: "proof-6" },
};

function passingLensEvidence(id, index) {
  const fixed = PASSING_LENS_EVIDENCE[id];
  if (fixed) {
    return fixed;
  }
  return { acceptance: `evidence-${index + 1}`, verification: `proof-${index + 1}` };
}

function passingReviewLenses() {
  return REQUIRED_REVIEW_LENSES.map((id, index) => {
    const evidence = passingLensEvidence(id, index);
    return {
      id,
      owner: "task-1",
      evidence: `lens-${id}`,
      headSha: PROOF_HANDOFF.headSha,
      acceptanceEvidence: evidence.acceptance,
      verificationEvidence: evidence.verification,
    };
  });
}

function recordValue(record, reviewLenses) {
  if (record === "lens-ownership") {
    return reviewLenses;
  }
  return true;
}

function incompleteScenario() {
  return evaluateConvergence({
    records: { requirements: true, clarifications: true, "implementation-plan": true },
    tasks: [{ id: "task-2", child: "wiring", evidence: "" }],
    children: [{ id: "implementation", evidence: "mapped" }],
    reviewLenses: [{ id: "implementation", owner: "task-2", evidence: "lens-implementation" }],
    acceptance: [{ id: "AC-2", evidence: "" }],
    contradictions: ["user path not exercised"],
  });
}

function passingScenario() {
  const reviewLenses = passingReviewLenses();
  return evaluateConvergence({
    records: Object.fromEntries(REQUIRED_RECORDS.map((record) => [record, recordValue(record, reviewLenses)])),
    tasks: [
      {
        id: "task-1",
        child: "search-flow",
        evidence: ["commit abc123", ...REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`)],
        acceptanceEvidence: PROOF_ACCEPTANCE_MATRIX.map((row) => row.evidence),
        verificationEvidence: PROOF_ACCEPTANCE_MATRIX.map((row) => row.proof),
      },
    ],
    children: [{ id: "search-flow", evidence: "mapped" }],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "proof" }],
    acceptanceMatrix: PROOF_ACCEPTANCE_MATRIX,
    headSha: PROOF_HANDOFF.headSha,
  });
}

export function scenarioResult(scenario = "passing") {
  if (scenario === "ordinary") {
    return evaluateConvergence({ path: "ordinary" });
  }
  if (scenario === "incomplete") {
    return incompleteScenario();
  }
  if (scenario === "passing") {
    return passingScenario();
  }
  throw new Error(`Unknown proof scenario "${scenario}". Expected: ${PROOF_SCENARIOS.join(", ")}`);
}

export function runProof(scenario = "passing") {
  const result = scenarioResult(scenario);
  process.stdout.write(`${renderConvergence(result, PROOF_HANDOFF)}\n`);
  return result;
}

// The documented entry keeps exposing the constants and the renderer that moved
// into the convergence modules, so its callers and tests import one path.
// biome-ignore lint/performance/noBarrelFile: documented public entry of the proof
export { REQUIRED_RECORDS, REQUIRED_REVIEW_LENSES } from "./convergence-core.mjs";
export { renderConvergence } from "./convergence-render.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runProof(process.argv[2] ?? "passing");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
