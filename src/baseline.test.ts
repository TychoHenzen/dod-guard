import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBaseline, type BaselineStepInput } from "./baseline.js";
import type { ProofCategory } from "./types.js";

function step(title: string, ...cats: ProofCategory[]): BaselineStepInput {
  return { title, proofs: cats.map((category) => ({ category, predicate: { type: "exit_code" } })) };
}

/** A DoD that satisfies every hard-mandatory category plus TDD. */
function completeSteps(): BaselineStepInput[] {
  return [
    step("Logic", "tdd", "test"),
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
