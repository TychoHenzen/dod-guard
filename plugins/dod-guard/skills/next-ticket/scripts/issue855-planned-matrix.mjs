// The planned acceptance matrix of the #855-shape fixture (issue855-shape.mjs).
function plannedRow(spec, extra = {}) {
  const { id, contract, path, name } = spec;
  return {
    id,
    contract,
    path,
    proof: `proof-${name}`,
    evidence: `ev-${name}`,
    expected: `${path} behaves as planned`,
    status: "pending",
    ...extra,
  };
}

const inapplicable = (reason) => ({ status: "inapplicable", expected: "inapplicable", reason });

// The corrected form adds R9, the recovery row that the reliability lens cites.
export function issue855PlannedMatrix({ corrected }) {
  return [
    plannedRow({ id: "R1", contract: "AC-1", path: "archived-items", name: "ac1-archived" }),
    plannedRow({ id: "R2", contract: "AC-2", path: "unclaimed-closes", name: "ac2-unclaimed" }),
    plannedRow(
      { id: "R3", contract: "AC-3", path: "identity/authorization", name: "path-identity" },
      inapplicable("no credential is read"),
    ),
    plannedRow({ id: "R4", contract: "AC-3", path: "interactive-control", name: "path-interactive-control" }),
    plannedRow(
      { id: "R5", contract: "AC-3", path: "browser/e2e", name: "path-browser-e2e" },
      inapplicable("no browser surface"),
    ),
    plannedRow({ id: "R6", contract: "AC-1", path: "data/error", name: "path-data-error" }),
    plannedRow({ id: "R7", contract: "AC-3", path: "recovery", name: "path-recovery" }),
    plannedRow({ id: "R8", contract: "AC-3", path: "quality", name: "ac3-quality" }),
    ...(corrected ? [plannedRow({ id: "R9", contract: "AC-1", path: "recovery", name: "ac1-recovery" })] : []),
  ];
}
