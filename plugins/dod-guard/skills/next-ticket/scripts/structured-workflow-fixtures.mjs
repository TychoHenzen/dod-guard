import * as proof from "./structured-workflow-proof.mjs";

export { acceptanceMatrix } from "./passing-matrix.mjs";
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

function plannedRow(id, contract, path, name, extra = {}) {
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

// The #855 records before their hand correction: the reliability lens is
// owned by T1, which declares only the data/error row, while the one recovery
// row is declared by T3. The correction gives T1 and the reliability lens a
// recovery row of their own, as the #855 handoff recorded. wiringPathMissing
// drops browser/e2e from the wiring/usability lens instead.
export function issue855Shape({ corrected = false, wiringPathMissing = false } = {}) {
  const reliabilityRows = ["ac1-archived", "path-data-error", ...(corrected ? ["ac1-recovery"] : [])];
  const wiringRows = ["path-interactive-control", ...(wiringPathMissing ? [] : ["path-browser-e2e"])];
  const tasks = [
    shapeTask("T1", reliabilityRows, ["ev-lens-reliability"]),
    shapeTask("T2", ["ac2-unclaimed"], ["ev-lens-implementation"]),
    shapeTask(
      "T3",
      ["path-identity", "path-interactive-control", "path-browser-e2e", "path-recovery", "ac3-quality"],
      ["ev-lens-wiring", "ev-lens-quality"],
    ),
  ];
  const reviewLenses = [
    shapeLens("implementation", "T2", ["ac2-unclaimed"]),
    shapeLens("wiring/usability", "T3", wiringRows),
    shapeLens("quality", "T3", ["ac3-quality"]),
    shapeLens("reliability", "T1", reliabilityRows),
  ];
  const plannedAcceptanceMatrix = [
    plannedRow("R1", "AC-1", "archived-items", "ac1-archived"),
    plannedRow("R2", "AC-2", "unclaimed-closes", "ac2-unclaimed"),
    plannedRow("R3", "AC-3", "identity/authorization", "path-identity", inapplicable("no credential is read")),
    plannedRow("R4", "AC-3", "interactive-control", "path-interactive-control"),
    plannedRow("R5", "AC-3", "browser/e2e", "path-browser-e2e", inapplicable("no browser surface")),
    plannedRow("R6", "AC-1", "data/error", "path-data-error"),
    plannedRow("R7", "AC-3", "recovery", "path-recovery"),
    plannedRow("R8", "AC-3", "quality", "ac3-quality"),
    ...(corrected ? [plannedRow("R9", "AC-1", "recovery", "ac1-recovery")] : []),
  ];
  return {
    records: { ...recordsWithRequiredKeys(reviewLenses), "task-list": tasks },
    tasks,
    children: [],
    reviewLenses,
    acceptance: ["AC-1", "AC-2", "AC-3"].map((id) => ({ id, evidence: `${id.toLowerCase()}-observed` })),
    plannedAcceptanceMatrix,
  };
}

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
