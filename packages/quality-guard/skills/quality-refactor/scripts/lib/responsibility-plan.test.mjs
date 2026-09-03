import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStructuralPlan, evaluateStructuralCompletion } from "./responsibility-plan.mjs";

function discovery() {
  return {
    stagedMap: {
      targetScope: ["src/invoice"],
      responsibilities: [
        { name: "invoice calculation", currentOwners: ["InvoiceService"], consumers: ["Checkout"], dependencies: ["TaxRate"] },
        { name: "invoice persistence", currentOwners: ["InvoiceService"], consumers: ["Checkout"], dependencies: ["Database"] },
      ],
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
        evidence: { scannerSymptoms: ["file-length", "complexity", "param-count"] },
      },
      {
        responsibility: "invoice persistence",
        desiredOwner: "InvoiceRepository",
        directory: "src/invoice/persistence",
        publicBoundary: "InvoiceService remains the application boundary",
        dependencyDirection: "InvoiceService -> InvoiceRepository -> Database",
        stableContracts: ["InvoiceService.save"],
        compatibilityRemovals: [],
        evidence: { scannerSymptoms: [] },
      },
    ],
  };
}
test("structural task keeps an extraction, callers, and tests together", () => {
  const plan = buildStructuralPlan(discovery());
  assert.deepEqual(plan.tasks[0].callSiteMigrations, ["Checkout"]);
  assert.deepEqual(plan.tasks[0].testMigrations, ["InvoiceService.calculate"]);
  assert.match(plan.tasks[0].title, /invoice calculation.*InvoiceCalculator/i);
});
test("one responsibility move precedes cleanup for its shared local symptoms", () => {
  const plan = buildStructuralPlan(discovery());
  assert.equal(plan.tasks.filter((task) => task.responsibility === "invoice calculation").length, 1);
  assert.deepEqual(plan.tasks[0].scannerSymptoms, ["file-length", "complexity", "param-count"]);
});
test("out-of-scope violations are informational and create no task", () => {
  const plan = buildStructuralPlan(discovery(), {
    violations: [{ path: "src/other/legacy.ts", rule: "complexity" }],
  });
  assert.equal(plan.tasks.some((task) => task.paths.includes("src/other/legacy.ts")), false);
  assert.deepEqual(plan.outOfScopeViolations, [{ path: "src/other/legacy.ts", rule: "complexity" }]);
});
test("large scopes batch dependency-ordered responsibility clusters", () => {
  const large = discovery();
  large.stagedMap.targetScope = Array.from({ length: 50 }, (_, index) => `src/file-${index}.ts`);
  large.structuralOutcomes[1].dependsOn = ["invoice calculation"];
  const plan = buildStructuralPlan(large, { clusterSize: 1 });
  assert.equal(plan.largeScope, true);
  assert.deepEqual(plan.clusters.map((cluster) => cluster.responsibilities), [["invoice calculation"], ["invoice persistence"]]);
});
test("ambiguous concept scope requires selection before task generation", () => {
  const plan = buildStructuralPlan(discovery(), {
    conceptCandidates: ["src/invoice", "src/billing"],
  });
  assert.equal(plan.status, "needs_scope_confirmation");
  assert.equal(plan.tasks.length, 0);
});
test("temporary redistribution stays inside an ordered structural unit and ends without regression", () => {
  const result = evaluateStructuralCompletion({
    initial: { scanner: { complexity: 2 }, architecture: { owners: ["InvoiceService"] } },
    behavior: { build: "passed", tests: "passed" },
    units: [{ id: "calculation", steps: [{ scanner: { complexity: 3 } }, { scanner: { complexity: 1 } }] }],
    final: { scanner: { complexity: 1 }, architecture: { owners: ["InvoiceCalculator"] } },
    target: { owners: ["InvoiceCalculator"] },
  });
  assert.equal(result.status, "ready");
  assert.equal(result.units[0].temporaryRedistribution, true);
});
test("red initial behavior checks stop before planning", () => {
  const result = evaluateStructuralCompletion({
    initial: { scanner: {}, architecture: {} },
    behavior: { build: "failed", tests: "passed" },
    units: [], final: { scanner: {}, architecture: {} }, target: {},
  });
  assert.equal(result.status, "blocked_red_baseline");
});
test("initial evidence is copied before planning and never rewritten", () => {
  const initial = { scanner: { complexity: 2 }, architecture: { owners: ["InvoiceService"] } };
  const result = evaluateStructuralCompletion({
    initial, behavior: { build: "passed", tests: "passed" }, units: [],
    final: { scanner: { complexity: 2 }, architecture: { owners: ["InvoiceService"] } }, target: {},
  });
  initial.scanner.complexity = 99;
  assert.equal(result.initial.scanner.complexity, 2);
  assert.equal(result.trackedBaselineChanged, false);
});
test("unchanged ownership leaves an architectural target incomplete", () => {
  const result = evaluateStructuralCompletion({
    initial: { scanner: { complexity: 2 }, architecture: { owners: ["InvoiceService"] } },
    behavior: { build: "passed", tests: "passed" }, units: [],
    final: { scanner: { complexity: 1 }, architecture: { owners: ["InvoiceService"] } },
    target: { owners: ["InvoiceCalculator"] },
  });
  assert.equal(result.status, "incomplete_architecture");
});
test("target evidence plus behavior checks marks the refactor ready for its commit gate", () => {
  const result = evaluateStructuralCompletion({
    initial: { scanner: { complexity: 2 }, architecture: { owners: ["InvoiceService"], boundaries: ["service->db"], compatibility: ["forwarder"] } },
    behavior: { build: "passed", tests: "passed" }, units: [],
    final: { scanner: { complexity: 1 }, architecture: { owners: ["InvoiceCalculator"], boundaries: ["service->calculator"], compatibility: [] } },
    target: { owners: ["InvoiceCalculator"], boundaries: ["service->calculator"], compatibility: [] },
  });
  assert.equal(result.status, "ready");
});
