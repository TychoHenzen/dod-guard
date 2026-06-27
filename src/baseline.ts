import type { ProofCategory } from "./types.js";

/**
 * Create-time enforcement of the company DoD baseline (standards/dod-baselines.md).
 *
 * dod-guard's thesis is that an agent must not be trusted to self-police its
 * proofs. The baseline's mandatory categories used to live only in the standards
 * doc — advisory text the authoring agent could ignore (and did: PBI #31790
 * shipped with zero integration proofs). This module makes the mandate
 * machine-enforced at dod_create instead.
 */

export interface BaselineProofInput {
  category: ProofCategory;
  predicate: { type: string };
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

/** Strong proofs verify behavior/correctness; weak proofs only confirm presence. */
const STRONG: ReadonlyArray<ProofCategory> = ["test", "tdd", "integration_behavioral", "manual"];
const WEAK: ReadonlyArray<ProofCategory> = ["structure", "lint", "format"];

export function validateBaseline(type: "bug" | "general", steps: BaselineStepInput[]): BaselineReport {
  const present = new Set<ProofCategory>();
  for (const s of steps) for (const p of s.proofs) present.add(p.category);

  const errors: string[] = [];
  for (const m of HARD_MANDATORY) {
    if (!present.has(m.cat)) {
      errors.push(`Missing mandatory proof category "${m.cat}" (${type} DoD). ${m.label}`);
    }
  }

  const warnings: string[] = [];
  if (!present.has("tdd")) {
    warnings.push(
      type === "bug"
        ? 'No "tdd" proof. A bug fix should include a regression test that fails first (red), then passes.'
        : 'No "tdd" proof. New functionality should include a fail-first unit test.',
    );
  }

  // Mutation testing is the strongest signal that the tests actually catch bugs
  // (a passing suite can still kill zero mutants). Soft, non-blocking nudge —
  // deliberately NOT in HARD_MANDATORY, so it never blocks dod_create.
  if (!present.has("mutation")) {
    warnings.push(
      'No "mutation" proof. A green suite can still catch zero bugs — for critical logic, add a mutation proof asserting surviving mutants stay <= N (cargo-mutants / mutmut / Stryker).',
    );
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
