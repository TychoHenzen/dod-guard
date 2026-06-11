import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { DodDocument, CheckResult, StepResult, ProofResult, Predicate, Proof } from "./types.js";

const execAsync = promisify(exec);

const TIMEOUT_MS = 120_000;

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
  if (proof.predicate.type === "manual") {
    return {
      id: proof.id,
      description: proof.description,
      status: "skipped",
      command: proof.command,
      output: "Manual verification — skipped by checker",
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

export async function checkDocument(doc: DodDocument, cwdOverride?: string): Promise<CheckResult> {
  const cwd = cwdOverride ?? doc.cwd;
  const stepResults: StepResult[] = [];
  let totalPass = 0;
  let totalFail = 0;

  for (const step of doc.steps) {
    const proofResults: ProofResult[] = [];
    let stepPassed = true;

    for (const proof of step.proofs) {
      const result = await executeProof(proof, cwd);
      proofResults.push(result);
      if (result.status === "fail") stepPassed = false;
    }

    // Step with no executable proofs (empty or all-manual) is not "pass"
    const executableCount = step.proofs.filter(p => p.predicate.type !== "manual").length;
    if (executableCount === 0) stepPassed = false;

    stepResults.push({
      id: step.id,
      title: step.title,
      status: stepPassed ? "pass" : "fail",
      proofs: proofResults,
    });
    if (stepPassed) totalPass++;
    else totalFail++;
  }

  // Proof-set fingerprint: hash of all (command, predicate) pairs.
  // If proofs are tampered in the store, the fingerprint changes —
  // humans reviewing the transcript can compare it to the original.
  const fingerprintData = doc.steps.flatMap(s =>
    s.proofs.map(p => `${p.command}|${p.predicate.type}|${p.predicate.value ?? ""}`)
  ).join("\n");
  const proofFingerprint = createHash("sha256").update(fingerprintData).digest("hex").slice(0, 12);

  const overall = totalFail === 0 ? "pass" : "fail";
  return {
    overall,
    steps: stepResults,
    summary: `${totalPass}/${doc.steps.length} steps pass${totalFail > 0 ? `, ${totalFail} failing` : ""}`,
    timestamp: new Date().toISOString(),
    proof_fingerprint: proofFingerprint,
  };
}
