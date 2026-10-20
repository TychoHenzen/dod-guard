import { ACCEPTANCE_MATRIX_PATHS } from "../../../lib/acceptance-matrix.mjs";

// One passing observed row per required path plus quality, bound to headSha.
// The proof scenarios and the convergence tests build the same rows from here.
// A prefix renames the evidence and proof strings for tests that keep two
// matrices apart; the default prefix leaves them as evidence-N and proof-N.
export function acceptanceMatrix(headSha, contract = "AC-1", prefix = "") {
  return [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((pathName, index) => ({
    id: `${contract}-${index + 1}`,
    contract,
    path: pathName,
    proof: `${prefix}proof-${index + 1}`,
    expected: `expected-${index + 1}`,
    observed: `observed-${index + 1}`,
    status: "pass",
    evidence: `${prefix}evidence-${index + 1}`,
    headSha,
  }));
}
