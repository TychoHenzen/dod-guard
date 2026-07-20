import assert from "node:assert/strict";
import { test } from "node:test";
import { type BaselineStepInput, baselineLockError, validateBaseline } from "./baseline.js";
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
  brevity: "greenfield project, no structural debt yet",
  performance: "no perf-sensitive code",
  complexity: "no algorithmic code",
  coverage: "no new testable surface",
  duplication: "no shared logic",
  manual: "no UI or human-verifiable behavior",
};

/** All mandatory + all optional categories present, no skip_reasons needed. */
function completeSteps(): BaselineStepInput[] {
  return [
    step(
      "Logic",
      "tdd",
      "test",
      "mutation",
      "streamline",
      "observability",
      "brevity",
      "performance",
      "complexity",
      "coverage",
      "duplication",
    ),
    step("Wire it up", "integration_wiring", "integration_behavioral"),
    { title: "Human check", proofs: [{ category: "manual", predicate: { type: "manual" } }] },
  ];
}

/** Minimal steps: only hard-mandatory present, all optional skipped. */
function minimalSteps(): BaselineStepInput[] {
  return [step("Logic", "test"), step("Wire it up", "integration_wiring", "integration_behavioral")];
}

// ── Complete DoD ──────────────────────────────────────────────────────────

test("a complete DoD has no errors and no warnings", () => {
  const r = validateBaseline("general", completeSteps());
  assert.deepEqual(r.errors, [], "complete DoD should have no errors");
  assert.deepEqual(r.warnings, [], "complete DoD should have no warnings");
});

test("a minimal DoD with all skip_reasons has no errors, only skip_reason warnings", () => {
  const r = validateBaseline("general", minimalSteps(), ALL_SKIPPED);
  assert.deepEqual(r.errors, [], "minimal DoD with all reasons skipped should have no errors");
  assert.equal(r.warnings.length, 10, "all 10 skipped categories → 10 warnings");
  assert.ok(
    r.warnings.every((w) => /skip_reason/.test(w)),
    "all warnings should mention skip_reason",
  );
});

// ── Hard mandatory: never skippable ───────────────────────────────────────

test("missing behavioral integration proof is a hard error", () => {
  const steps = [step("Logic", "test"), step("Wire", "integration_wiring")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(
    r.errors.some((e) => /integration_behavioral/.test(e)),
    "should flag missing integration_behavioral",
  );
});

test("missing wiring integration proof is a hard error", () => {
  const steps = [step("Logic", "test"), step("Run", "integration_behavioral")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(
    r.errors.some((e) => /integration_wiring/.test(e)),
    "should flag missing integration_wiring",
  );
});

test("missing full test-suite proof is a hard error", () => {
  const steps = [step("Logic"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("bug", steps, ALL_SKIPPED);
  assert.ok(
    r.errors.some((e) => /"test"/.test(e)),
    "should flag missing test category",
  );
});

test("hard mandatory categories NOT skippable via skip_reasons", () => {
  const steps = [step("Logic", "test"), step("Wire", "integration_behavioral")];
  // integration_wiring is hard mandatory — skip_reason does nothing for it
  const r = validateBaseline("general", steps, { integration_wiring: "not needed", ...ALL_SKIPPED });
  assert.ok(
    r.errors.some((e) => /integration_wiring/.test(e)),
    "hard mandatory must error regardless of skip_reasons",
  );
});

// ── Optional: absent + no skip_reason → ERROR ─────────────────────────────

test("all optional categories absent + no skip_reasons → 10 hard errors", () => {
  const r = validateBaseline("general", minimalSteps()); // NO skip_reasons
  assert.equal(
    r.errors.length,
    10,
    "tdd + mutation + streamline + observability + brevity + 4 regression cats + manual = 10 errors",
  );
});

test("one optional missing (tdd) while others skipped → single error", () => {
  const steps = minimalSteps();
  const reasons: Record<string, string> = {
    mutation: "ok",
    streamline: "ok",
    observability: "ok",
    brevity: "ok",
    performance: "ok",
    complexity: "ok",
    coverage: "ok",
    duplication: "ok",
    manual: "ok",
    // tdd deliberately omitted
  };
  const r = validateBaseline("general", steps, reasons);
  assert.equal(r.errors.length, 1, "only tdd should error");
  assert.match(r.errors[0], /tdd/, "error message should reference tdd category");
});

test("one optional missing (mutation) while others skipped → single error", () => {
  const reasons = { ...ALL_SKIPPED };
  delete reasons.mutation;
  const r = validateBaseline("general", minimalSteps(), reasons);
  assert.equal(r.errors.length, 1, "only mutation should error");
  assert.match(r.errors[0], /mutation/, "error message should reference mutation category");
});

test("one optional missing (observability) while others skipped → single error", () => {
  const reasons = { ...ALL_SKIPPED };
  delete reasons.observability;
  const r = validateBaseline("general", minimalSteps(), reasons);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /observability/, "error message should reference observability category");
});

test("one regression category missing while others skipped → single error", () => {
  const reasons = { ...ALL_SKIPPED };
  delete reasons.performance;
  const r = validateBaseline("general", minimalSteps(), reasons);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /performance/, "error message should reference performance category");
});

// ── Optional: absent + skip_reason → WARNING ──────────────────────────────

test("all optional categories with skip_reasons → all warnings, no errors", () => {
  const r = validateBaseline("general", minimalSteps(), ALL_SKIPPED);
  assert.deepEqual(r.errors, [], "all skipped should produce no errors");
  assert.equal(r.warnings.length, 10, "10 skipped categories → 10 warnings");
  assert.ok(
    r.warnings.every((w) => /skip_reason/.test(w)),
    "every warning should mention skip_reason",
  );
});

test("skip_reason text appears in warning message", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    tdd: "config-only change, no logic to test",
  });
  assert.ok(
    r.warnings.some((w) => /tdd/i.test(w) && /config-only/i.test(w)),
    "warning should mention tdd and the custom skip_reason text",
  );
});

test("skip_reason text appears for observability", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    observability: "config files only, no runtime logic",
  });
  assert.ok(
    r.warnings.some((w) => /observability/i.test(w) && /config files only/i.test(w)),
    "warning should mention observability and the skip_reason text",
  );
});

test("skip_reason for mutation with custom message", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    mutation: "trivial CRUD, mutation overkill",
  });
  assert.ok(
    r.warnings.some((w) => /mutation.*skip_reason.*trivial CRUD/i.test(w)),
    "warning should match mutation skip_reason with custom message",
  );
});

// ── Categories present → no issue ─────────────────────────────────────────

test("all optional categories present → clean (no errors, no warnings)", () => {
  const r = validateBaseline("general", completeSteps());
  assert.deepEqual(r.errors, [], "complete DoD should produce no errors");
  assert.deepEqual(r.warnings, [], "complete DoD should produce no warnings");
});

test("mutation present → no mutation warning or error", () => {
  const steps = [
    step("Logic", "test", "tdd", "mutation"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /mutation/i.test(e)), "mutation present → no error");
  assert.ok(!r.warnings.some((w) => /mutation/i.test(w)), "mutation present → no warning");
});

test("streamline present → no streamline warning or error", () => {
  const steps = [
    step("Logic", "test", "tdd", "mutation", "streamline"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /streamline/i.test(e)));
  assert.ok(!r.warnings.some((w) => /streamline/i.test(w)));
});

test("observability present → no observability warning or error", () => {
  const steps = [
    step("Logic", "test", "tdd", "observability"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /observability/i.test(e)));
  assert.ok(!r.warnings.some((w) => /observability/i.test(w)));
});

test("brevity present → no brevity warning or error", () => {
  const steps = [step("Logic", "test", "tdd", "brevity"), step("Wire", "integration_wiring", "integration_behavioral")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /brevity/i.test(e)));
  assert.ok(!r.warnings.some((w) => /brevity/i.test(w)));
});

test("brevity absent + skip_reason → warning", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    brevity: "prototype, will refactor later",
  });
  assert.ok(
    r.warnings.some((w) => /brevity/i.test(w) && /prototype/i.test(w)),
    "warning should mention brevity and the skip_reason text",
  );
});

test("brevity absent + no skip_reason → error", () => {
  const reasons = { ...ALL_SKIPPED };
  delete reasons.brevity;
  const r = validateBaseline("general", minimalSteps(), reasons);
  assert.equal(r.errors.length, 1, "only brevity should error");
  assert.match(r.errors[0], /brevity/, "error message should reference brevity category");
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
  assert.ok(
    r.warnings.some((w) => /tdd/i.test(w)),
    "bug type should still warn on skipped TDD",
  );
});

// ── Manual/review proof requirement ──────────────────────────────────────────

test("general type without manual/review and no skip_reason → error", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const { manual: _m, ...reasons } = ALL_SKIPPED;
  const r = validateBaseline("general", steps, reasons);
  assert.ok(
    r.errors.some((e) => /manual|review/.test(e)),
    "should require manual/review proof",
  );
});

test("general type with manual proof present → no error", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
    { title: "Review", proofs: [{ category: "manual", predicate: { type: "manual" } }] },
  ];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /manual|review/.test(e)), "manual proof present → no error");
});

test("general type with review proof present → no error", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
    { title: "Code review", proofs: [{ category: "manual", predicate: { type: "review" } }] },
  ];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(!r.errors.some((e) => /manual|review/.test(e)), "review proof present → no error");
});

test("general type without manual/review but with skip_reason → warning, no error", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const r = validateBaseline("general", steps, {
    ...ALL_SKIPPED,
    manual: "no human-verifiable behavior",
  });
  assert.ok(!r.errors.some((e) => /manual|review/.test(e)), "skip_reason for manual → no error");
  assert.ok(
    r.warnings.some((w) => /manual/.test(w)),
    "should warn about skipped manual",
  );
});

test("minimal type not affected by manual/review requirement", () => {
  const steps: BaselineStepInput[] = [step("Something", "lint")];
  const r = validateBaseline("minimal", steps);
  assert.ok(!r.errors.some((e) => /manual|review/.test(e)), "minimal type should not require manual/review");
});

test("bug type without manual/review and no skip_reason → error", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const { manual: _m, ...reasons } = ALL_SKIPPED;
  const r = validateBaseline("bug", steps, reasons);
  assert.ok(
    r.errors.some((e) => /manual|review/.test(e)),
    "bug type should require manual/review",
  );
});

test("baselineLockError for general type without manual/review → non-null", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  const { manual: _m, ...reasons } = ALL_SKIPPED;
  const err = baselineLockError("general", steps, reasons);
  assert.ok(err, "should return lock error");
  assert.match(err as string, /manual|review/, "error should mention manual/review");
});

test("baselineLockError for general type with manual proof → null", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
    { title: "Human check", proofs: [{ category: "manual", predicate: { type: "manual" } }] },
  ];
  assert.equal(baselineLockError("general", steps, ALL_SKIPPED), null, "should pass lock with manual proof");
});

test("baselineLockError for general type with skip_reason for manual → null", () => {
  const steps: BaselineStepInput[] = [
    step("Logic", "test"),
    step("Wire", "integration_wiring", "integration_behavioral"),
  ];
  assert.equal(baselineLockError("general", steps, { ...ALL_SKIPPED, manual: "no UI to verify" }), null);
});

// ── Edge cases ──────────────────────────────────────────────────────────────

test("empty steps array returns only baseline errors", () => {
  const r = validateBaseline("general", []);
  assert.ok(r.errors.length > 0, "empty steps should have errors");
});

test("step with empty proofs array does not crash", () => {
  const steps: BaselineStepInput[] = [{ title: "Empty step", proofs: [] }];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  assert.ok(
    r.errors.some((e) => /test/.test(e)),
    "should error on missing test category",
  );
});

test("null/undefined skipReasons handled gracefully", () => {
  // Passing undefined should not crash — treated as no skip reasons
  const r = validateBaseline("general", minimalSteps(), undefined);
  assert.equal(
    r.errors.length,
    10,
    "undefined skipReasons should be treated as absent, producing 10 errors for missing optional categories",
  );
});

test("duplicate categories within a step are deduplicated", () => {
  const steps: BaselineStepInput[] = [step("Logic", "test", "test", "test")];
  const r = validateBaseline("general", steps, ALL_SKIPPED);
  // Only integration_wiring and integration_behavioral are missing — duplicates must not inflate count
  assert.equal(
    r.errors.length,
    2,
    "should have exactly 2 errors (missing integration_wiring and integration_behavioral) not 4+",
  );
  assert.ok(
    r.errors.some((e) => /integration_wiring/.test(e)),
    "should flag missing integration_wiring",
  );
  assert.ok(
    r.errors.some((e) => /integration_behavioral/.test(e)),
    "should flag missing integration_behavioral",
  );
});

test("unrecognized skipReasons keys do not cause errors", () => {
  const r = validateBaseline("general", minimalSteps(), {
    ...ALL_SKIPPED,
    "nonexistent-category": "should be ignored",
  } as Record<string, string>);
  assert.deepEqual(r.errors, [], "unknown skipReasons should be ignored");
});

test("bug type coverage: all optional categories absent errors apply to bug type", () => {
  const r = validateBaseline("bug", minimalSteps()); // NO skip_reasons
  assert.equal(r.errors.length, 10, "bug type also enforces all 9 optional + manual/review categories");
});

// ── minimal type (F2 / #21) ────────────────────────────────────────────────

test("minimal type produces zero errors even with no proofs and no skip_reasons", () => {
  const r = validateBaseline("minimal", [step("Anything", "lint")]); // no mandatory, no skip
  assert.deepEqual(r.errors, [], "minimal enforces no baseline categories");
});

test("minimal type still emits strength warnings for weak-only steps", () => {
  const r = validateBaseline("minimal", [step("Weak step", "lint", "format")]);
  assert.equal(r.errors.length, 0, "minimal never errors on baseline");
  assert.ok(
    r.warnings.some((w) => /only presence\/structural proofs/.test(w)),
    "strength check runs regardless of type",
  );
});

test("minimal type with empty tree has no errors", () => {
  const r = validateBaseline("minimal", []);
  assert.deepEqual(r.errors, []);
});

// ── baselineLockError (F1) ─────────────────────────────────────────────────

test("baselineLockError returns null for a complete general DoD", () => {
  assert.equal(baselineLockError("general", completeSteps()), null);
});

test("baselineLockError returns a formatted message when mandatory categories are missing", () => {
  const err = baselineLockError("general", minimalSteps()); // missing all 9 optional, no skip
  assert.ok(err, "should return an error message");
  assert.match(err as string, /cannot lock DoD/);
  assert.match(err as string, /minimal/, "should hint at the minimal escape hatch");
});

test("baselineLockError returns null for minimal type regardless of missing categories", () => {
  assert.equal(baselineLockError("minimal", [step("x", "lint")]), null);
});

test("baselineLockError returns null when missing categories are all skipped with reasons", () => {
  assert.equal(baselineLockError("general", minimalSteps(), ALL_SKIPPED), null);
});
