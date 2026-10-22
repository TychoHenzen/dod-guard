import {
  reviewLenses as buildReviewLenses,
  recordsWithRequiredKeys,
} from "../../../next-ticket/scripts/convergence-builders.mjs";
import {
  acceptanceMatrix as buildAcceptanceMatrix,
} from "../../../next-ticket/scripts/passing-matrix.mjs";
import {
  REQUIRED_REVIEW_LENSES,
} from "../../../next-ticket/scripts/structured-workflow-proof.mjs";

function convergenceTasks(acceptanceMatrix) {
  return [
    {
      id: "task-1",
      child: "search-flow",
      evidence: [
        "commit-proof",
        ...REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`),
      ],
      acceptanceEvidence: acceptanceMatrix.map((row) => row.evidence),
      verificationEvidence: acceptanceMatrix.map((row) => row.proof),
    },
    {
      id: "task-2",
      child: "settings-flow",
      evidence: "settings-proof",
    },
  ];
}

export function validConvergenceInput() {
  const reviewLenses = buildReviewLenses({
    headSha: "proof-head",
    prefix: "matrix-",
  });
  const acceptanceMatrix = buildAcceptanceMatrix(
    "proof-head",
    "AC-1",
    "matrix-",
  );
  return {
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: convergenceTasks(acceptanceMatrix),
    children: [
      { id: "search-flow", evidence: "slice-proof" },
      { id: "settings-flow", evidence: "settings-slice-proof" },
    ],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "acceptance-proof" }],
    acceptanceMatrix,
    headSha: "proof-head",
  };
}
