import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { DodDocument, CheckResult, StepResult, ProofResult, Predicate, Proof } from "./types.js";
import { perProofFingerprint } from "./manual.js";
import { extractNumber } from "./regression.js";

const execAsync = promisify(exec);

const TIMEOUT_MS = 120_000;

/**
 * Extract the surviving-mutant count from a mutation tool's combined output.
 *
 * Tries built-in patterns for the three supported tools in order: Stryker
 * (JS/TS), mutmut (Python), cargo-mutants (Rust). A "surviving" mutant is one
 * the test suite failed to kill — cargo-mutants calls these "missed", Stryker
 * and mutmut call them "survived". Returns the count, or `null` when no
 * recognised summary matched (the caller treats null as a fail-safe FAIL —
 * never a pass on output it cannot parse).
 */
export function parseSurvivors(output: string): number | null {
  for (const parser of [parseStryker, parseMutmut, parseCargoMutants]) {
    const survivors = parser(output);
    if (survivors !== null) return survivors;
  }
  return null;
}

/** Stryker clear-text reporter: read the "# survived" column of the table. */
function parseStryker(output: string): number | null {
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.includes("|") && /#\s*survived/i.test(l));
  if (headerIdx === -1) return null;
  const headerCells = lines[headerIdx].split("|").map((c) => c.trim().toLowerCase());
  const col = headerCells.findIndex((c) => /survived/.test(c));
  if (col === -1) return null;
  const dataLine = lines.find((l) => l.includes("|") && l.trim().toLowerCase().startsWith("all files"));
  if (!dataLine) return null;
  const value = Number(dataLine.split("|").map((c) => c.trim())[col]);
  return Number.isFinite(value) ? value : null;
}

/** mutmut: the 🙁 marker in run-progress and `mutmut results` legend. */
function parseMutmut(output: string): number | null {
  const match = output.match(/🙁[^\d]*(\d+)/);
  return match ? Number(match[1]) : null;
}

/** cargo-mutants summary: "N missed" — missed mutants are survivors. */
function parseCargoMutants(output: string): number | null {
  const match = output.match(/(\d+)\s+missed\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Proof-set fingerprint for tamper detection. Hashes each proof's
 * command|type|value (tolerance), plus lower_is_better and advisory ONLY when
 * those fields are present. The conditional append is what keeps the change
 * backward-compatible: a legacy proof (no new fields) hashes exactly as it did
 * before, so existing locked docs do not false-trip tamper detection. New
 * fields, once set, are covered — a hard gate cannot be silently flipped to
 * advisory, nor the compare direction quietly changed, without the hash moving.
 */
export function computeProofFingerprint(steps: Array<{ proofs: Proof[] }>): string {
  const data = steps
    .flatMap((s) =>
      s.proofs.map((p) => {
        let line = `${p.command}|${p.predicate.type}|${p.predicate.value ?? ""}`;
        if (p.predicate.lower_is_better !== undefined) line += `|lib:${p.predicate.lower_is_better}`;
        if (p.advisory !== undefined) line += `|adv:${p.advisory}`;
        return line;
      }),
    )
    .join("\n");
  return createHash("sha256").update(data).digest("hex").slice(0, 12);
}

function evaluatePredicate(
  predicate: Predicate,
  exitCode: number,
  stdout: string,
): boolean {
  switch (predicate.type) {
    case "exit_code":
      return exitCode === (predicate.value as number);
    case "exit_code_not":
      return exitCode !== (predicate.value as number);
    case "output_contains":
      return stdout.includes(predicate.value as string);
    case "output_matches":
      return new RegExp(predicate.value as string, "m").test(stdout);
    case "output_not_contains":
      return !stdout.includes(predicate.value as string);
    case "output_not_matches":
      return !new RegExp(predicate.value as string, "m").test(stdout);
    case "tdd":
      // TDD evaluation is handled separately in executeProof — this only
      // checks the "green" condition (command exits with expected code).
      return exitCode === (predicate.value as number ?? 0);
    case "manual":
    case "review":
      // Out-of-band verdicts are resolved in executeProof, not here.
      return true;
    default:
      return false;
  }
}

async function runCommand(proof: Proof, cwd: string): Promise<{ exitCode: number; combined: string; duration: number; error?: string; killed?: boolean; notFound?: boolean }> {
  const start = Date.now();
  try {
    const shellCmd = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const { stdout, stderr } = await execAsync(proof.command, {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      shell: shellCmd,
      windowsHide: true,
    });
    return { exitCode: 0, combined: (stdout + stderr).slice(0, 4000), duration: Date.now() - start };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const execErr = err as { code?: number; stdout?: string; stderr?: string; killed?: boolean; message?: string };
    const exitCode = execErr.code ?? 1;
    const stdout = (execErr.stdout ?? "") as string;
    const stderr = (execErr.stderr ?? "") as string;
    const combined = (stdout + stderr).slice(0, 4000);

    if (execErr.killed) {
      return { exitCode, combined: `TIMEOUT after ${TIMEOUT_MS}ms`, duration, error: "Process killed due to timeout", killed: true };
    }

    const notFound = exitCode === 127 || exitCode === 9009
      || /not recognized|command not found|no such file/i.test(stderr + (execErr.message ?? ""));
    if (notFound) {
      return { exitCode, combined, duration, error: `Command not found or not executable (exit ${exitCode})`, notFound: true };
    }

    return { exitCode, combined, duration, error: stderr.slice(0, 2000) || undefined };
  }
}

async function executeProof(proof: Proof, cwd: string): Promise<ProofResult> {
  // Out-of-band proofs (manual, review) are verified through a channel the model
  // cannot drive — never by running a command, and never auto-triggered by
  // dod_check. `dod_check` only reads back whatever verdict the dedicated
  // `dod_verify` tool already recorded on `proof.manual_result` (Claude calls
  // dod_verify explicitly when it judges verification is actually relevant,
  // e.g. right after implementing the step). No matching record => unverified.
  if (proof.predicate.type === "manual" || proof.predicate.type === "review") {
    const isReview = proof.predicate.type === "review";
    const label = isReview ? "Code review" : "Manual verification";
    const fingerprint = perProofFingerprint(proof);
    const mr = proof.manual_result;

    if (mr && mr.proof_fingerprint === fingerprint) {
      const output = `${label} ${mr.answer.toUpperCase()} (via dod_verify) at ${mr.confirmed_at} via ${mr.channel}${mr.note ? ` — "${mr.note}"` : ""}`;
      return {
        id: proof.id,
        description: proof.description,
        status: mr.answer,
        command: proof.command,
        output,
        error: mr.answer === "fail" ? `${label} was confirmed as failing by the human.` : undefined,
      };
    }

    return {
      id: proof.id,
      description: proof.description,
      status: "skipped",
      command: proof.command,
      output: `${label} not yet verified — call dod_verify(dod_id, "${proof.id}") to request human confirmation.`,
    };
  }

  const run = await runCommand(proof, cwd);

  if (run.killed || run.notFound) {
    return {
      id: proof.id, description: proof.description, status: "fail",
      command: proof.command, output: run.combined, error: run.error,
      exit_code: run.exitCode, duration_ms: run.duration,
    };
  }

  // Mutation predicate: parse the surviving-mutant count from the tool output
  // and PASS iff survivors <= value (default 0). Fail-safe — output we cannot
  // parse FAILS with an explicit reason, never passes. Runs in-band: tool
  // not-found / timeout already returned above via runCommand's notFound/killed.
  if (proof.predicate.type === "mutation") {
    const maxAllowed = (proof.predicate.value as number) ?? 0;
    const survivors = parseSurvivors(run.combined);

    if (survivors === null) {
      return {
        id: proof.id, description: proof.description, status: "fail",
        command: proof.command, output: run.combined,
        error: "could not parse mutation results (no recognized Stryker/mutmut/cargo-mutants summary)",
        exit_code: run.exitCode, duration_ms: run.duration,
      };
    }

    const passed = survivors <= maxAllowed;
    return {
      id: proof.id, description: proof.description, status: passed ? "pass" : "fail",
      command: proof.command, output: run.combined,
      error: passed ? undefined : `mutation: ${survivors} surviving mutant(s) exceeds the allowed maximum of ${maxAllowed}`,
      exit_code: run.exitCode, duration_ms: run.duration,
    };
  }

  // Regression predicate: two-phase, keyed by whether a baseline is captured.
  // Fail-safe — output with no parseable metric FAILS, never auto-passes.
  if (proof.predicate.type === "regression") {
    const measured = extractNumber(run.combined, proof.predicate.extract);

    if (measured === null) {
      return {
        id: proof.id, description: proof.description, status: "fail",
        command: proof.command, output: run.combined,
        error: "regression: could not parse a metric number from output (fail-safe — never auto-passes)",
        exit_code: run.exitCode, duration_ms: run.duration,
      };
    }

    // Capture phase: no baseline yet → store this PRE-change metric and PASS.
    // This run is expected on pre-change code (ordered capture step).
    if (proof.baseline_value === undefined) {
      proof.baseline_value = measured;
      proof.baseline_captured_at = new Date().toISOString();
      return {
        id: proof.id, description: proof.description, status: "pass",
        command: proof.command, output: run.combined,
        error: `regression: baseline captured (N0=${measured}). Re-run after the change to compare.`,
        exit_code: run.exitCode, duration_ms: run.duration,
      };
    }

    // Compare phase: evaluate the new metric against the stored baseline.
    const baseline = proof.baseline_value;
    const tol = (proof.predicate.value as number) ?? 0;
    const lowerIsBetter = proof.predicate.lower_is_better ?? true;
    const passed = lowerIsBetter
      ? measured <= baseline * (1 + tol)
      : measured >= baseline * (1 - tol);

    const direction = lowerIsBetter ? "<=" : ">=";
    const threshold = lowerIsBetter ? baseline * (1 + tol) : baseline * (1 - tol);
    return {
      id: proof.id, description: proof.description, status: passed ? "pass" : "fail",
      command: proof.command, output: run.combined,
      error: passed
        ? undefined
        : `regression: ${measured} fails ${direction} ${threshold} (baseline ${baseline}, tolerance ${tol})`,
      exit_code: run.exitCode, duration_ms: run.duration,
    };
  }

  // TDD predicate: must have been observed failing before it can pass
  if (proof.predicate.type === "tdd") {
    const greenExitCode = (proof.predicate.value as number) ?? 0;
    const isGreen = run.exitCode === greenExitCode;

    if (!isGreen) {
      // Test is currently failing (RED phase) — record it
      proof.seen_failing = true;
      proof.seen_failing_at = proof.seen_failing_at ?? new Date().toISOString();
      return {
        id: proof.id, description: proof.description, status: "fail",
        command: proof.command, output: run.combined, error: run.error,
        exit_code: run.exitCode, duration_ms: run.duration,
      };
    }

    if (isGreen && !proof.seen_failing) {
      // Test passes but was never seen failing — TDD violation
      return {
        id: proof.id, description: proof.description, status: "fail",
        command: proof.command, output: run.combined,
        error: "TDD VIOLATION: test passed without ever failing. Write a failing test first, run dod_check to record the red phase, then implement.",
        exit_code: run.exitCode, duration_ms: run.duration,
      };
    }

    // isGreen && seen_failing — TDD complete
    return {
      id: proof.id, description: proof.description, status: "pass",
      command: proof.command, output: run.combined,
      exit_code: run.exitCode, duration_ms: run.duration,
    };
  }

  const passed = evaluatePredicate(proof.predicate, run.exitCode, run.combined);
  return {
    id: proof.id, description: proof.description, status: passed ? "pass" : "fail",
    command: proof.command, output: run.combined, error: run.error,
    exit_code: run.exitCode, duration_ms: run.duration,
  };
}

/**
 * Build a step result from each proof's persisted last_status WITHOUT executing
 * any command. Used for steps other than the target on a scoped run, so a
 * `--step N` check costs only the target step's proofs.
 */
function carryForwardStep(step: DodDocument["steps"][number]): StepResult {
  const proofs: ProofResult[] = step.proofs.map((p) => ({
    id: p.id,
    description: p.description,
    // A never-run proof (last_status "pending") has no result to carry; surface
    // it as "skipped" for display. It is not persisted on a scoped run.
    status: p.last_status === "pending" ? "skipped" : p.last_status,
    command: p.command,
    output: p.last_output,
  }));
  const allPass = step.proofs.length > 0 && step.proofs.every((p) => p.last_status === "pass");
  return { id: step.id, title: step.title, status: allPass ? "pass" : "fail", proofs };
}

export async function checkDocument(
  doc: DodDocument,
  cwdOverride?: string,
  opts?: { stepId?: string },
): Promise<CheckResult> {
  const cwd = cwdOverride ?? doc.cwd;
  const scopedStepId = opts?.stepId;
  const stepResults: StepResult[] = [];
  let totalPass = 0;
  let totalFail = 0;
  // Distinguish a real failure (blocks overall FAIL) from a manual/review proof
  // that simply hasn't been verified yet via dod_verify this run (blocks overall
  // only to INCOMPLETE — "not yet checked", not "checked and failed").
  let anyRealFail = false;
  let anyUnverified = false;

  for (const step of doc.steps) {
    // Scoped run: execute only the target step; carry the rest forward unrun.
    if (scopedStepId && step.id !== scopedStepId) {
      const carried = carryForwardStep(step);
      stepResults.push(carried);
      if (carried.status === "pass") totalPass++;
      else totalFail++;
      continue;
    }

    const proofResults: ProofResult[] = [];
    let stepPassed = true;

    for (const proof of step.proofs) {
      const result = await executeProof(proof, cwd);
      proofResults.push(result);
      // Advisory tier: a failing advisory proof is reported (status stays "fail",
      // warning loudly) but does NOT fail the step or the overall result.
      if (result.status === "fail" && !proof.advisory) { stepPassed = false; anyRealFail = true; }
      // An unverified manual/review proof holds the step (and overall) short of
      // PASS too, but as "incomplete" rather than "fail" — see anyUnverified above.
      if (result.status === "skipped" && !proof.advisory) { stepPassed = false; anyUnverified = true; }
    }

    // A step with no proofs at all cannot pass. Manual proofs are now first-class
    // (verified by a human via dod_verify), so an all-manual step CAN pass once
    // dod_verify has recorded a PASS for each of them.
    if (step.proofs.length === 0) stepPassed = false;

    stepResults.push({
      id: step.id,
      title: step.title,
      status: stepPassed ? "pass" : "fail",
      proofs: proofResults,
    });
    if (stepPassed) totalPass++;
    else totalFail++;
  }

  // Proof-set fingerprint: hash of all (command, predicate) pairs (+ new fields
  // when present). If proofs are tampered in the store, the fingerprint changes —
  // humans reviewing the transcript can compare it to the original.
  const proofFingerprint = computeProofFingerprint(doc.steps);

  // Tamper detection: the stored fingerprint was set by dod_create/dod_amend. If
  // the recomputed set differs, the store was edited outside dod_amend — block.
  const tampered = !!(doc.proof_fingerprint && doc.proof_fingerprint !== proofFingerprint);

  // A scoped run verifies only one step, so it can never assert the whole DoD is
  // done — overall is always "incomplete". Only a full run yields pass/fail/
  // incomplete. Tamper always forces "fail", overriding everything else; a real
  // failure forces "fail" over "incomplete"; an unverified manual/review proof
  // (and nothing worse) holds the verdict at "incomplete" until dod_verify runs.
  const overall: CheckResult["overall"] = tampered
    ? "fail"
    : scopedStepId
      ? "incomplete"
      : anyRealFail
        ? "fail"
        : anyUnverified
          ? "incomplete"
          : "pass";

  const baseSummary = scopedStepId
    ? `SCOPED (step "${scopedStepId}"): ${totalPass}/${doc.steps.length} steps currently pass — run a full dod_check (no step) to verify completion`
    : `${totalPass}/${doc.steps.length} steps pass${totalFail > 0 ? `, ${totalFail} failing` : ""}`;
  const summary = tampered
    ? `TAMPER DETECTED — proof-set fingerprint mismatch (store edited outside dod_amend). Verdict forced to FAIL. ${baseSummary}`
    : !scopedStepId && anyUnverified && !anyRealFail
      ? `${baseSummary} — one or more manual/review proofs await dod_verify`
      : baseSummary;

  return {
    overall,
    steps: stepResults,
    summary,
    timestamp: new Date().toISOString(),
    proof_fingerprint: proofFingerprint,
    ...(scopedStepId ? { scoped: true, ran_step_id: scopedStepId } : {}),
    ...(tampered ? { tampered: true } : {}),
  };
}
