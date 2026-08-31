import assert from "node:assert/strict";
import { test } from "node:test";
import { validateResponsibilityDiscovery } from "./responsibility-map.mjs";

function discovery() {
  return {
    stagedMap: {
      targetScope: ["src/invoice"],
      responsibilities: [
        { name: "invoice calculation", currentOwners: ["InvoiceService"], consumers: ["Checkout"], dependencies: ["TaxRate" ] },
        { name: "invoice persistence", currentOwners: ["InvoiceService"], consumers: ["Checkout"], dependencies: ["Database"] },
      ],
      desired: {
        ownership: [{ responsibility: "invoice calculation", owner: "InvoiceCalculator" }],
        boundaries: [{ from: "InvoiceCalculator", to: "Database", allowed: false }],
      },
    },
    structuralOutcomes: [
      {
        responsibility: "invoice calculation",
        desiredOwner: "InvoiceCalculator",
        directory: "src/invoice/calculation",
        publicBoundary: "Checkout continues to call InvoiceService.calculate",
        dependencyDirection: "InvoiceService -> InvoiceCalculator -> TaxRate",
        stableContracts: ["InvoiceService.calculate"],
        compatibilityRemovals: ["InvoiceService.calculateTax forwarding method"],
        evidence: { scannerSymptoms: ["file-length", "complexity"], cause: "calculation and persistence share an owner" },
      },
      {
        responsibility: "invoice persistence",
        desiredOwner: "InvoiceRepository",
        directory: "src/invoice/persistence",
        publicBoundary: "InvoiceService remains the application boundary",
        dependencyDirection: "InvoiceService -> InvoiceRepository -> Database",
        stableContracts: ["InvoiceService.save"],
        compatibilityRemovals: [],
        evidence: { scannerSymptoms: [], cause: "separate dependency and consumer path" },
      },
    ],
  };
}

// covers: quality-guard/quality-refactor :: responsibility map drives architectural work :: Existing class owns unrelated responsibilities
test("discovery separates responsibilities even without a scanner symptom", () => {
  const result = validateResponsibilityDiscovery(discovery());
  assert.equal(result.stagedMap.responsibilities.length, 2);
  assert.deepEqual(result.structuralOutcomes[1].evidence.scannerSymptoms, []);
});

// covers: quality-guard/quality-refactor :: responsibility map drives architectural work :: Scanner reports local symptoms
test("discovery attaches scanner symptoms to their responsibility cause", () => {
  const result = validateResponsibilityDiscovery(discovery());
  assert.deepEqual(result.structuralOutcomes[0].evidence.scannerSymptoms, ["file-length", "complexity"]);
  assert.match(result.structuralOutcomes[0].evidence.cause, /share an owner/);
});

// covers: quality-guard/quality-refactor :: desired ownership is defined before implementation tasks :: Responsibility needs a new module
test("discovery requires a desired owner, directory, and dependency direction", () => {
  const incomplete = discovery();
  delete incomplete.structuralOutcomes[0].directory;
  assert.throws(() => validateResponsibilityDiscovery(incomplete), /directory/);
});

// covers: quality-guard/quality-refactor :: desired ownership is defined before implementation tasks :: Public contract must remain stable
test("discovery records stable contracts and compatibility removals", () => {
  const result = validateResponsibilityDiscovery(discovery());
  assert.deepEqual(result.structuralOutcomes[0].stableContracts, ["InvoiceService.calculate"]);
  assert.deepEqual(result.structuralOutcomes[0].compatibilityRemovals, ["InvoiceService.calculateTax forwarding method"]);
});
