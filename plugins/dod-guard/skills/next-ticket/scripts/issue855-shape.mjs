import { recordsWithRequiredKeys } from "./convergence-builders.mjs";
import { issue855PlannedMatrix } from "./issue855-planned-matrix.mjs";

function shapeTask(id, names, lensEvidence) {
  return {
    id,
    title: `${id} task`,
    parentLevel: "convergence",
    evidence: [`ev-${id.toLowerCase()}-change`, ...lensEvidence],
    acceptanceEvidence: names.map((name) => `ev-${name}`),
    verificationEvidence: names.map((name) => `proof-${name}`),
  };
}

function shapeLens(id, owner, names) {
  return {
    id,
    owner,
    evidence: [`ev-lens-${id === "wiring/usability" ? "wiring" : id}`],
    acceptanceEvidence: names.map((name) => `ev-${name}`),
    verificationEvidence: names.map((name) => `proof-${name}`),
  };
}

function issue855Tasks(reliabilityRows) {
  return [
    shapeTask("T1", reliabilityRows, ["ev-lens-reliability"]),
    shapeTask("T2", ["ac2-unclaimed"], ["ev-lens-implementation"]),
    shapeTask(
      "T3",
      ["path-identity", "path-interactive-control", "path-browser-e2e", "path-recovery", "ac3-quality"],
      ["ev-lens-wiring", "ev-lens-quality"],
    ),
  ];
}

function issue855Lenses(reliabilityRows, wiringRows) {
  return [
    shapeLens("implementation", "T2", ["ac2-unclaimed"]),
    shapeLens("wiring/usability", "T3", wiringRows),
    shapeLens("quality", "T3", ["ac3-quality"]),
    shapeLens("reliability", "T1", reliabilityRows),
  ];
}

// The #855 records before their hand correction: the reliability lens is
// owned by T1, which declares only the data/error row, while the one recovery
// row is declared by T3. The correction gives T1 and the reliability lens a
// recovery row of their own, as the #855 handoff recorded. wiringPathMissing
// drops browser/e2e from the wiring/usability lens instead.
export function issue855Shape({ corrected = false, wiringPathMissing = false } = {}) {
  const reliabilityRows = ["ac1-archived", "path-data-error", ...(corrected ? ["ac1-recovery"] : [])];
  const wiringRows = ["path-interactive-control", ...(wiringPathMissing ? [] : ["path-browser-e2e"])];
  const tasks = issue855Tasks(reliabilityRows);
  const reviewLenses = issue855Lenses(reliabilityRows, wiringRows);
  return {
    records: { ...recordsWithRequiredKeys(reviewLenses), "task-list": tasks },
    tasks,
    children: [],
    reviewLenses,
    acceptance: ["AC-1", "AC-2", "AC-3"].map((id) => ({ id, evidence: `${id.toLowerCase()}-observed` })),
    plannedAcceptanceMatrix: issue855PlannedMatrix({ corrected }),
  };
}
