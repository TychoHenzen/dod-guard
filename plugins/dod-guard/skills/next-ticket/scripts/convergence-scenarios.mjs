import { recordsWithRequiredKeys, reviewLenses } from "./convergence-builders.mjs";
import { REQUIRED_REVIEW_LENSES } from "./convergence-core.mjs";
import { acceptanceMatrix } from "./passing-matrix.mjs";

const PROOF_SCENARIOS = ["passing", "incomplete", "ordinary"];

const PROOF_HANDOFF = {
  url: "https://github.com/owner/repo/issues/1#issuecomment-1",
  headSha: "abc1234",
};

function incompleteInput() {
  return {
    records: { requirements: true, clarifications: true, "implementation-plan": true },
    tasks: [{ id: "task-2", child: "wiring", evidence: "" }],
    children: [{ id: "implementation", evidence: "mapped" }],
    reviewLenses: [{ id: "implementation", owner: "task-2", evidence: "lens-implementation" }],
    acceptance: [{ id: "AC-2", evidence: "" }],
    contradictions: ["user path not exercised"],
  };
}

function passingInput() {
  const lenses = reviewLenses({ headSha: PROOF_HANDOFF.headSha });
  const matrix = acceptanceMatrix(PROOF_HANDOFF.headSha);
  return {
    records: recordsWithRequiredKeys(lenses),
    tasks: [
      {
        id: "task-1",
        child: "search-flow",
        evidence: ["commit abc123", ...REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`)],
        acceptanceEvidence: matrix.map((row) => row.evidence),
        verificationEvidence: matrix.map((row) => row.proof),
      },
    ],
    children: [{ id: "search-flow", evidence: "mapped" }],
    reviewLenses: lenses,
    acceptance: [{ id: "AC-1", evidence: "proof" }],
    acceptanceMatrix: matrix,
    headSha: PROOF_HANDOFF.headSha,
  };
}

// The object evaluateConvergence receives for a named proof scenario.
function scenarioInput(scenario = "passing") {
  if (scenario === "ordinary") {
    return { path: "ordinary" };
  }
  if (scenario === "incomplete") {
    return incompleteInput();
  }
  if (scenario === "passing") {
    return passingInput();
  }
  throw new Error(`Unknown proof scenario "${scenario}". Expected: ${PROOF_SCENARIOS.join(", ")}`);
}

export { PROOF_HANDOFF, PROOF_SCENARIOS, scenarioInput };
