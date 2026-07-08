import type { ProofCategory } from "./types.js";

/**
 * Create-time enforcement of the company DoD baseline (standards/dod-baselines.md).
 *
 * dod-guard's thesis is that an agent must not be trusted to self-police its
 * proofs. The baseline's mandatory categories used to live only in the standards
 * doc — advisory text the authoring agent could ignore (and did: PBI #31790
 * shipped with zero integration proofs). This module makes the mandate
 * machine-enforced at dod_create instead.
 *
 * Two-tier enforcement for optional categories:
 *   - Category present → no issue
 *   - Category absent + skip_reason provided → advisory warning (author
 *     consciously opted out with justification)
 *   - Category absent + NO skip_reason → HARD ERROR (author ignored the
 *     baseline — must either add the proof or explain the omission)
 */

export interface BaselineProofInput {
  category: ProofCategory;
  predicate: { type: string };
  /** Advisory tier — accepted, never makes a category mandatory. */
  advisory?: boolean;
}

export interface BaselineStepInput {
  title: string;
  proofs: BaselineProofInput[];
}

export interface BaselineReport {
  errors: string[];
  warnings: string[];
}

// ── Hard-mandatory categories ─────────────────────────────────────────────

const WIRING_LABEL =
  "Integration (wiring): a structural grep proving the change is connected " +
  "to the real system (import in a real caller, route registration, public export).";

const BEHAVIORAL_LABEL =
  "Integration (behavioral): exercise the change through the system's actual " +
  "entry point (API/CLI/page render), not a test harness.";

const TEST_LABEL = "Full test suite: a proof that the whole suite stays green (no regressions).";

const HARD_MANDATORY: ReadonlyArray<{ cat: ProofCategory; label: string }> = [
  { cat: "integration_wiring",    label: WIRING_LABEL },
  { cat: "integration_behavioral", label: BEHAVIORAL_LABEL },
  { cat: "test",                   label: TEST_LABEL },
];

// ── Optional-requiring-justification ──────────────────────────────────────

const TDD_WARN_BUG =
  'No "tdd" proof — a bug fix should include a regression test that fails ' +
  'first (red), then passes. Add a tdd proof, or provide a skip_reason.';

const TDD_WARN_GENERAL =
  'No "tdd" proof — new functionality should include a fail-first unit test. ' +
  'Add a tdd proof, or provide a skip_reason.';

const MUTATION_WARN =
  'No "mutation" proof — a green suite can still catch zero bugs. For critical ' +
  'logic, add a mutation proof (cargo-mutants / mutmut / Stryker), or provide a skip_reason.';

const STREAMLINE_WARN =
  'No "streamline" proof — when revising existing code, a streamline proof ' +
  'verifies old implementations were removed. Add one (grep/rg/findstr for old ' +
  'symbols), or provide a skip_reason.';

const OBSERVABILITY_WARN =
  'No "observability" proof — changed source files should have log statements ' +
  'at error paths, no empty catch/swallowed errors. Add an observability proof, ' +
  'or provide a skip_reason.';

const BREVITY_WARN =
  'No "brevity" proof — changed source files should be scanned for structural ' +
  'bloat: functions >30 lines, mixed selection+iteration, files >300 lines, ' +
  'lines >120 chars, replacement without removal. Add a brevity proof, or ' +
  'provide a skip_reason.';

const OPTIONAL_REQUIRING_JUSTIFICATION: ReadonlyArray<{
  cat: ProofCategory;
  label: string;
  warnMsg: (type: string) => string;
}> = [
  {
    cat: "tdd",
    label: "TDD: a fail-first test for new/changed behavior.",
    warnMsg: (t: string) => (t === "bug" ? TDD_WARN_BUG : TDD_WARN_GENERAL),
  },
  { cat: "mutation",   label: "Mutation testing: prove the test suite actually catches bugs.",        warnMsg: () => MUTATION_WARN },
  { cat: "streamline",    label: "Streamline: prove old implementations were removed.",                warnMsg: () => STREAMLINE_WARN },
  { cat: "observability", label: "Observability: prove changed files are instrumented for debugging.", warnMsg: () => OBSERVABILITY_WARN },
  { cat: "brevity",       label: "Brevity: prove code is clean — short functions, single-purpose.",   warnMsg: () => BREVITY_WARN },
];

// ── Regression categories ─────────────────────────────────────────────────

const REGRESSION_CATEGORIES: ReadonlyArray<{ cat: ProofCategory; label: string }> = [
  { cat: "performance",  label: "Performance: prove no perf regression via regression predicate." },
  { cat: "complexity",   label: "Complexity: prove cyclomatic complexity does not regress." },
  { cat: "coverage",     label: "Coverage: prove test coverage does not drop." },
  { cat: "duplication",  label: "Duplication: prove code duplication does not increase." },
];

// ── Strength classification ───────────────────────────────────────────────

const STRONG: ReadonlyArray<ProofCategory> = ["test", "tdd", "integration_behavioral", "manual"];
const WEAK:  ReadonlyArray<ProofCategory> = ["structure", "lint", "format"];

// ── Helpers ───────────────────────────────────────────────────────────────

function collectPresent(steps: BaselineStepInput[]): Set<ProofCategory> {
  const present = new Set<ProofCategory>();
  for (const s of steps) for (const p of s.proofs) present.add(p.category);
  return present;
}

function checkHardMandatory(
  present: Set<ProofCategory>,
  type: "bug" | "general",
): string[] {
  const errors: string[] = [];
  for (const m of HARD_MANDATORY) {
    if (!present.has(m.cat)) {
      errors.push(
        `Missing mandatory proof category "${m.cat}" (${type} DoD). ${m.label}`,
      );
    }
  }
  return errors;
}

function checkOptional(
  present: Set<ProofCategory>,
  skipReasons: Record<string, string> | undefined,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const check = (
    cat: ProofCategory,
    label: string,
    warnMsg: string,
  ) => {
    if (present.has(cat)) return;
    const reason = skipReasons?.[cat];
    if (reason) {
      warnings.push(`⚠ "${cat}" omitted (skip_reason: "${reason}").`);
    } else {
      errors.push(
        `Missing "${cat}" proof. ${label} Either add a proof for this category, ` +
        `or provide skip_reasons["${cat}"] with a justification for why it does ` +
        `not apply to this change.`,
      );
    }
  };

  for (const opt of OPTIONAL_REQUIRING_JUSTIFICATION) {
    check(opt.cat, opt.label, opt.warnMsg("general"));
  }
  for (const rc of REGRESSION_CATEGORIES) {
    check(rc.cat, rc.label, rc.label);
  }

  return { errors, warnings };
}

function checkStrengthOnly(
  steps: BaselineStepInput[],
): string[] {
  const warnings: string[] = [];
  for (const s of steps) {
    if (s.proofs.length === 0) continue;
    const hasStrong = s.proofs.some((p) => STRONG.includes(p.category));
    const allWeak = s.proofs.every((p) => WEAK.includes(p.category));
    if (!hasStrong && allWeak) {
      warnings.push(
        `Step "${s.title}" has only presence/structural proofs — these confirm ` +
        `code exists, not that it works. Add a behavioral or test proof.`,
      );
    }
  }
  return warnings;
}

// ── Public API ────────────────────────────────────────────────────────────

export function validateBaseline(
  type: "bug" | "general",
  steps: BaselineStepInput[],
  skipReasons?: Record<string, string>,
): BaselineReport {
  console.debug("baseline: validateBaseline", { type, stepCount: steps.length });
  const present = collectPresent(steps);
  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(...checkHardMandatory(present, type));

  const optResult = checkOptional(present, skipReasons);
  errors.push(...optResult.errors);
  warnings.push(...optResult.warnings);

  warnings.push(...checkStrengthOnly(steps));

  return { errors, warnings };
}
