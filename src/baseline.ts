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
  /** Advisory tier (regression proofs default to this) — accepted, never makes a category mandatory. */
  advisory?: boolean;
}

export interface BaselineStepInput {
  title: string;
  proofs: BaselineProofInput[];
}

export interface BaselineReport {
  /** Hard violations — dod_create must reject. */
  errors: string[];
  /** Soft advisories — surfaced but do not block creation. */
  warnings: string[];
}

/**
 * Categories that are hard-mandatory: a DoD with a machine-checkable entry point
 * must prove the change is both wired in and exercised, and that the suite stays
 * green. These are the categories PBI #31790 proved get skipped when only
 * advisory. Missing any of them blocks creation.
 */
const HARD_MANDATORY: ReadonlyArray<{ cat: ProofCategory; label: string }> = [
  { cat: "integration_wiring", label: "Integration (wiring): a structural grep proving the change is connected to the real system (import in a real caller, route registration, public export)." },
  { cat: "integration_behavioral", label: "Integration (behavioral): exercise the change through the system's actual entry point (API/CLI/page render), not a test harness." },
  { cat: "test", label: "Full test suite: a proof that the whole suite stays green (no regressions)." },
];

/**
 * Optional categories that AUTHOR MUST explicitly justify omitting.
 * If absent from all steps AND no skip_reason provided → hard error.
 * If absent + skip_reason provided → soft warning (conscious opt-out).
 * If present → no issue.
 */
const OPTIONAL_REQUIRING_JUSTIFICATION: ReadonlyArray<{ cat: ProofCategory; label: string; warnMsg: (type: string) => string }> = [
  {
    cat: "tdd",
    label: "TDD: a fail-first test for new/changed behavior.",
    warnMsg: (type: string) =>
      type === "bug"
        ? 'No "tdd" proof — a bug fix should include a regression test that fails first (red), then passes. Add a tdd proof, or provide a skip_reason.'
        : 'No "tdd" proof — new functionality should include a fail-first unit test. Add a tdd proof, or provide a skip_reason.',
  },
  {
    cat: "mutation",
    label: "Mutation testing: prove the test suite actually catches bugs.",
    warnMsg: () =>
      'No "mutation" proof — a green suite can still catch zero bugs. For critical logic, add a mutation proof (cargo-mutants / mutmut / Stryker), or provide a skip_reason.',
  },
  {
    cat: "streamline",
    label: "Streamline: prove old implementations were removed when revising functionality.",
    warnMsg: () =>
      'No "streamline" proof — when revising existing code, a streamline proof verifies old implementations were removed. Add one (grep/rg/findstr for old symbols), or provide a skip_reason.',
  },
  {
    cat: "observability",
    label: "Observability: prove changed files are instrumented for debugging.",
    warnMsg: () =>
      'No "observability" proof — changed source files should have log statements at error paths, no empty catch/swallowed errors. Add an observability proof, or provide a skip_reason.',
  },
  {
    cat: "brevity",
    label: "Brevity: prove code is clean — short functions, single-purpose, old code removed.",
    warnMsg: () =>
      'No "brevity" proof — changed source files should be scanned for structural bloat: functions >30 lines, mixed selection+iteration, files >300 lines, lines >120 chars, replacement without removal. Add a brevity proof, or provide a skip_reason.',
  },
];

/** Regression categories — same skip_reason enforcement as other optional cats. */
const REGRESSION_CATEGORIES: ReadonlyArray<{ cat: ProofCategory; label: string }> = [
  { cat: "performance", label: "Performance: prove no perf regression via regression predicate." },
  { cat: "complexity", label: "Complexity: prove cyclomatic complexity does not regress." },
  { cat: "coverage", label: "Coverage: prove test coverage does not drop." },
  { cat: "duplication", label: "Duplication: prove code duplication does not increase." },
];

/** Strong proofs verify behavior/correctness; weak proofs only confirm presence. */
const STRONG: ReadonlyArray<ProofCategory> = ["test", "tdd", "integration_behavioral", "manual"];
const WEAK: ReadonlyArray<ProofCategory> = ["structure", "lint", "format"];

export function validateBaseline(
  type: "bug" | "general",
  steps: BaselineStepInput[],
  skipReasons?: Record<string, string>,
): BaselineReport {
  const present = new Set<ProofCategory>();
  for (const s of steps) for (const p of s.proofs) present.add(p.category);

  const errors: string[] = [];
  for (const m of HARD_MANDATORY) {
    if (!present.has(m.cat)) {
      errors.push(`Missing mandatory proof category "${m.cat}" (${type} DoD). ${m.label}`);
    }
  }

  const warnings: string[] = [];

  // Optional categories: escalate to hard error if absent AND no skip_reason.
  // Demote to soft warning if absent WITH skip_reason (conscious opt-out).
  for (const opt of OPTIONAL_REQUIRING_JUSTIFICATION) {
    if (present.has(opt.cat)) continue;
    const reason = skipReasons?.[opt.cat];
    if (reason) {
      warnings.push(`⚠ "${opt.cat}" omitted (skip_reason: "${reason}").`);
    } else {
      errors.push(
        `Missing "${opt.cat}" proof. ${opt.label} Either add a proof for this category, or provide skip_reasons["${opt.cat}"] with a justification for why it does not apply to this change.`,
      );
    }
  }

  // Regression categories: same escalation logic.
  for (const rc of REGRESSION_CATEGORIES) {
    if (present.has(rc.cat)) continue;
    const reason = skipReasons?.[rc.cat];
    if (reason) {
      warnings.push(`⚠ "${rc.cat}" omitted (skip_reason: "${reason}").`);
    } else {
      errors.push(
        `Missing "${rc.cat}" proof. ${rc.label} Either add a regression proof for this metric, or provide skip_reasons["${rc.cat}"] with a justification for why it does not apply to this change.`,
      );
    }
  }

  // Presence-only step: confirms code exists, not that it works (PC-1).
  for (const s of steps) {
    if (s.proofs.length === 0) continue;
    const hasStrong = s.proofs.some((p) => STRONG.includes(p.category));
    const allWeak = s.proofs.every((p) => WEAK.includes(p.category));
    if (!hasStrong && allWeak) {
      warnings.push(`Step "${s.title}" has only presence/structural proofs — these confirm code exists, not that it works. Add a behavioral or test proof.`);
    }
  }

  return { errors, warnings };
}
