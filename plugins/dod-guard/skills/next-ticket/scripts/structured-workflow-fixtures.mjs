import { ACCEPTANCE_MATRIX_PATHS } from "../../goal-sdlc/scripts/lib/acceptance-matrix.mjs";
import * as proof from "./structured-workflow-proof.mjs";

// Builders shared by the structured-convergence tests.
export { proof };

const SECTIONS = [
  "Requirements and clarifications",
  "Plan and tasks",
  "Functional decomposition",
  "Acceptance and verification",
];

// A rendered convergence line reporting one section as passing.
export const PASSING_SECTION_LINE = new RegExp(`^- (?:${SECTIONS.join("|")}): verified$`, "m");

export const recordsWithRequiredKeys = (lensOwnership) =>
  proof.REQUIRED_RECORDS.reduce(
    (records, name) => ({ ...records, [name]: name === "lens-ownership" ? lensOwnership : true }),
    {},
  );

export function lensEvidence(id, index, prefix) {
  if (id === "wiring/usability") return [`${prefix}-2`, `${prefix}-3`];
  if (id === "reliability") return [`${prefix}-4`, `${prefix}-5`];
  if (id === "quality") return `${prefix}-6`;
  return `${prefix}-${index + 1}`;
}

export function acceptanceMatrix(headSha, contract = "AC-1") {
  return [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((pathName, index) => ({
    id: `${contract}-${index + 1}`,
    contract,
    path: pathName,
    proof: `proof-${index + 1}`,
    expected: `expected-${index + 1}`,
    observed: `observed-${index + 1}`,
    status: "pass",
    evidence: `evidence-${index + 1}`,
    headSha,
  }));
}
