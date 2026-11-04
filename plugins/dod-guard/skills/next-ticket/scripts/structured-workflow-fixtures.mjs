// Builders shared by the structured-convergence tests.
const SECTIONS = [
  "Requirements and clarifications",
  "Plan and tasks",
  "Functional decomposition",
  "Acceptance and verification",
];

// A rendered convergence line reporting one section as passing.
export const PASSING_SECTION_LINE = new RegExp(`^- (?:${SECTIONS.join("|")}): verified$`, "m");

// The handoff a refinement input becomes once every planned row passes at one
// pushed head. Lens records store no head; the proof binds them to headSha.
export function observedFromPlanned({ plannedAcceptanceMatrix, ...input }, headSha) {
  return {
    ...input,
    acceptanceMatrix: plannedAcceptanceMatrix.map((row) => ({
      ...row,
      observed: row.status === "inapplicable" ? "inapplicable" : `observed ${row.id}`,
      status: row.status === "inapplicable" ? "inapplicable" : "pass",
      headSha,
    })),
    headSha,
  };
}
