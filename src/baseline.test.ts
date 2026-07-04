import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBaseline, type BaselineStepInput } from "./baseline.js";
import type { ProofCategory } from "./types.js";

function step(title: string, ...cats: ProofCategory[]): BaselineStepInput {
  return { title, proofs: cats.map((category) => ({ category, predicate: { type: "exit_code" } })) };
}

/** A DoD that satisfies every hard-mandatory category plus TDD and mutation. */
function completeSteps(): BaselineStepInput[] {
  return [
    step("Logic", "tdd", "test", "mutation", "streamline"),
    step("Wire it up", "integration_wiring", "integration_behavioral"),
  ];
}

test("a complete DoD has no errors and no warnings", () => {
  const r = validateBaseline("general", completeSteps());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("missing behavioral integration proof is a hard error", () => {
  const steps = [step("Logic", "tdd", "test"), step("Wire", "integration_wiring")];
  const r = validateBaseline("general", steps);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /integration_behavioral/);
});

test("missing wiring integration proof is a hard error", () => {
  const steps = [step("Logic", "tdd", "test"), step("Run", "integration_behavioral")];
  const r = validateBaseline("general", steps);
  assert.ok(r.errors.some((e) => /integration_wiring/.test(e)));
});

test("missing full test-suite proof is a hard error", () => {
  const steps = [step("Logic", "tdd"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("bug", steps);
  assert.ok(r.errors.some((e) => /"test"/.test(e)));
});

test("missing TDD proof is a warning, not an error", () => {
  const steps = [step("Logic", "test"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps);
  assert.deepEqual(r.errors, [], "TDD absence must not block creation");
  assert.ok(r.warnings.some((w) => /TDD/i.test(w)));
});

test("mutation baseline warns when no mutation proof is present", () => {
  const steps = [step("Logic", "tdd", "test"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps);
  assert.deepEqual(r.errors, [], "mutation absence must never block creation");
  assert.ok(r.warnings.some((w) => /mutation/i.test(w)), "expected a soft warning nudging toward mutation testing");
});

test("mutation baseline does not warn when a mutation proof is present", () => {
  const steps = [step("Logic", "tdd", "test", "mutation"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps);
  assert.ok(!r.warnings.some((w) => /mutation/i.test(w)), "mutation present → no mutation warning");
});

test("regression: a regression+advisory DoD validates without new mandatory errors", () => {
  // The four regression categories are optional — they must never become
  // mandatory, and validateBaseline must accept the advisory proof flag.
  const steps: BaselineStepInput[] = [
    { title: "Perf gate", proofs: [{ category: "performance", predicate: { type: "regression" }, advisory: true }] },
    { title: "Coverage gate", proofs: [{ category: "coverage", predicate: { type: "regression" }, advisory: true }] },
    step("Logic", "tdd", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const r = validateBaseline("general", steps);
  assert.deepEqual(r.errors, [], "new regression categories must not become mandatory");
  assert.ok(
    !r.errors.some((e) => /performance|complexity|coverage|duplication/.test(e)),
    "regression categories must not be reported as missing mandatory categories",
  );
});

test("streamline baseline warns when no streamline proof is present", () => {
  const steps = [step("Logic", "tdd", "test"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps);
  assert.deepEqual(r.errors, [], "streamline absence must never block creation");
  assert.ok(r.warnings.some((w) => /streamline/i.test(w)), "expected a soft warning nudging toward streamline proofs");
});

test("streamline baseline does not warn when a streamline proof is present", () => {
  const steps = [step("Logic", "tdd", "test", "streamline"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps);
  assert.ok(!r.warnings.some((w) => /streamline/i.test(w)), "streamline present → no streamline warning");
});

test("a presence-only step is warned (structure without any behavioral/test proof)", () => {
  const steps = [
    step("Add field", "structure"), // weak only
    step("Logic", "tdd", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const r = validateBaseline("general", steps);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /presence|structural/i.test(w) && /Add field/.test(w)));
});
