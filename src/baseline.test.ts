import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBaseline, type BaselineStepInput } from "./baseline.js";
import type { ProofCategory } from "./types.js";

function step(title: string, ...cats: ProofCategory[]): BaselineStepInput {
  return { title, proofs: cats.map((category) => ({ category, predicate: { type: "exit_code" } })) };
}

/** Skip every optional category — regression + all warned categories. */
const ALL_SKIPPED: Record<string, string> = {
  tdd: "trivial change",
  mutation: "no critical logic",
  streamline: "greenfield",
  observability: "config-only change",
  performance: "no perf-sensitive code",
  complexity: "no algorithmic code",
  coverage: "no new testable surface",
  duplication: "no shared logic",
};

/** All mandatory + all optional categories present, no skip_reasons needed. */
function completeSteps(): BaselineStepInput[] {
  return [
    step("Logic", "tdd", "test", "mutation", "streamline", "observability",
      "performance", "complexity", "coverage", "duplication"),
    step("Wire it up", "integration_wiring", "integration_behavioral"),
  ];
}

/** Minimal steps: only hard-mandatory present, all optional skipped. */
function minimalSteps(): BaselineStepInput[] {
  return [
    step("Logic", "test"),
    step("Wire it up", "integration_wiring", "integration_behavioral"),
  ];
}

// ── Complete DoD ──────────────────────────────────────────────────────────

test("a complete DoD has no errors and no warnings", () => {
  const r = validateBaseline("general", completeSteps());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("a minimal DoD with all skip_reasons has no errors, only skip_reason warnings", () => {
  const r = validateBaseline("general", minimalSteps(), ALL_SKIPPED);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 8, "all 8 optional categories skipped → 8 warnings");
  assert.ok(r.warnings.every((w) => /skip_reason/.test(w)));
});

// ── Hard mandatory: never skippable ───────────────────────────────────────

test("missing behavioral integration proof is a hard error", () => {
  const steps = [step("Logic", "test"), step("Wire", "integration_wiring")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(r.errors.some((e) => /integration_behavioral/.test(e)));
});

test("missing wiring integration proof is a hard error", () => {
  const steps = [step("Logic", "test"), step("Run", "integration_behavioral")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(r.errors.some((e) => /integration_wiring/.test(e)));
});

test("missing full test-suite proof is a hard error", () => {
  const steps = [step("Logic"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("bug", steps, ALL_SKIPPED);
  assert.ok(r.errors.some((e) => /"test"/.test(e)));
});

test("hard mandatory categories NOT skippable via skip_reasons", () => {
  const steps = [step("Logic", "test"), step("Wire", "integration_behavioral")];
  // integration_wiring is hard mandatory — skip_reason does nothing for it
  const r = validateBaseline("general", steps, { integration_wiring: "not needed", ...ALL_SKIPPED });
  assert.ok(r.errors.some((e) => /integration_wiring/.test(e)), "hard mandatory must error regardless of skip_reasons");
});

// ── Optional: absent + no skip_reason → ERROR ─────────────────────────────

test("all optional categories absent + no skip_reasons → 8 hard errors", () => {
  const r = validateBaseline("general", minimalSteps()); // NO skip_reasons
  assert.equal(r.errors.length, 8, "tdd + mutation + streamline + observability + 4 regression cats = 8 errors");
});

test("one optional missing (tdd) while others skipped → single error", () => {
  const steps = minimalSteps();
  const reasons: Record<string, string> = {
    mutation: "ok", streamline: "ok", observability: "ok",
    performance: "ok", complexity: "ok", coverage: "ok", duplication: "ok",
    // tdd deliberately omitted
  };
  const r = validateBaseline("general", steps, reasons);
  assert.equal(r.errors.length, 1, "only tdd should error");
  assert.match(r.errors[0], /tdd/);
});

test("one optional missing (mutation) while others skipped → single error", () => {
  const reasons = { ...ALL_SKIPPED };
  delete reasons.mutation;
  const r = validateBaseline("general", minimalSteps(), reasons);
  assert.equal(r.errors.length, 1, "only mutation should error");
  assert.match(r.errors[0], /mutation/);
});

test("one optional missing (observability) while others skipped → single error", () => {
  const reasons = { ...ALL_SKIPPED };
  delete reasons.observability;
  const r = validateBaseline("general", minimalSteps(), reasons);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /observability/);
});

test("one regression category missing while others skipped → single error", () => {
  const reasons = { ...ALL_SKIPPED };
  delete reasons.performance;
  const r = validateBaseline("general", minimalSteps(), reasons);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /performance/);
});

// ── Optional: absent + skip_reason → WARNING ──────────────────────────────

test("all optional categories with skip_reasons → all warnings, no errors", () => {
  const r = validateBaseline("general", minimalSteps(), ALL_SKIPPED);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.every((w) => /skip_reason/.test(w)));
});

test("skip_reason text appears in warning message", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    tdd: "config-only change, no logic to test",
  });
  assert.ok(r.warnings.some((w) => /tdd/i.test(w) && /config-only/i.test(w)));
});

test("skip_reason text appears for observability", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    observability: "config files only, no runtime logic",
  });
  assert.ok(r.warnings.some((w) => /observability/i.test(w) && /config files only/i.test(w)));
});

test("skip_reason for mutation with custom message", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    mutation: "trivial CRUD, mutation overkill",
  });
  assert.ok(r.warnings.some((w) => /mutation.*skip_reason.*trivial CRUD/i.test(w)));
});

// ── Categories present → no issue ─────────────────────────────────────────

test("all optional categories present → clean (no errors, no warnings)", () => {
  const r = validateBaseline("general", completeSteps());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("mutation present → no mutation warning or error", () => {
  const steps = [step("Logic", "test", "tdd", "mutation"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /mutation/i.test(e)), "mutation present → no error");
  assert.ok(!r.warnings.some((w) => /mutation/i.test(w)), "mutation present → no warning");
});

test("streamline present → no streamline warning or error", () => {
  const steps = [step("Logic", "test", "tdd", "mutation", "streamline"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /streamline/i.test(e)));
  assert.ok(!r.warnings.some((w) => /streamline/i.test(w)));
});

test("observability present → no observability warning or error", () => {
  const steps = [step("Logic", "test", "tdd", "observability"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /observability/i.test(e)));
  assert.ok(!r.warnings.some((w) => /observability/i.test(w)));
});

test("regression category present → no error or warning for that category", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test", "tdd"),
    step("Wire", "integration_wiring", "integration_behavioral"),
    { title: "Perf gate", proofs: [{ category: "performance", predicate: { type: "regression" }, advisory: true }] },
  ];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /performance/i.test(e)), "performance present → no error");
  assert.ok(!r.warnings.some((w) => /performance/i.test(w)), "performance present → no warning");
});

// ── Presence-only step warning (unchanged) ────────────────────────────────

test("a presence-only step is warned (structure without any behavioral/test proof)", () => {
  const steps = [
    step("Add field", "structure"), // weak only
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(r.warnings.some((w) => /presence|structural/i.test(w) && /Add field/.test(w)));
});

// ── Bug type ──────────────────────────────────────────────────────────────

test("TDD skip_reason for bug type adapts message", () => {
  const steps = [step("Logic", "test"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("bug", steps, { tdd: "no regression surface for this bug", ...ALL_SKIPPED });
  assert.ok(r.warnings.some((w) => /tdd/i.test(w)));
});
