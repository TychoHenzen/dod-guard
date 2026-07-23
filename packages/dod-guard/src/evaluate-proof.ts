import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { perProofFingerprint } from "./manual.js";
import type { AdversarialGate, LeafResult, Predicate, TaskNode } from "./types.js";

const execFileP = promisify(execFile);

// ── Public types ──────────────────────────────────────────────────────────

export interface ProofExecutionOptions {
  confirmer?: (node: TaskNode) => Promise<{ answer: "pass" | "fail"; note?: string }>;
  /** Adversarial gate results from the DoD document — checked by adversarial/convergence predicates. */
  adversarial_gates?: AdversarialGate[];
}

interface ProofRun {
  stdout: string;
  stderr: string;
  code: number | null;
}

// ── Shell ─────────────────────────────────────────────────────────────────

function escapeForCmd(s: string): string {
  return s.replace(/'/g, "''");
}

// ── Diagnosis ─────────────────────────────────────────────────────────────

/** Generate a specific diagnosis when a behavioral predicate fails. */
function diagnoseFailure(node: TaskNode, result: LeafResult): string {
  const pred = node.predicate;
  if (!pred) return "No predicate defined — cannot diagnose failure.";

  const value = pred.value;
  const rawOutput = (result.output ?? "").slice(0, 500);
  const code = result.exit_code ?? -1;

  switch (pred.type) {
    case "exit_code":
      return (
        `Expected exit code ${value ?? 0}, got ${code}. ` +
        `Command failed to execute successfully. Check the error output above.`
      );

    case "exit_code_not":
      return (
        `Expected exit code other than ${value ?? 0}, got ${code}. ` +
        `Command succeeded when it should have failed — error handling may be missing.`
      );

    case "output_contains":
      return value
        ? `Expected output to contain "${value}" but it was not found in stdout/stderr. ` +
            `First 500 chars of output: "${rawOutput}"`
        : `Expected output to contain a value but none was specified in the predicate.`;

    case "output_not_contains":
      return (
        `Expected output NOT to contain "${value}" but it was found. ` +
        `Check that the unwanted text is no longer produced.`
      );

    case "output_matches":
      return value
        ? `Expected output to match /${value}/ but no match was found. ` + `First 500 chars of output: "${rawOutput}"`
        : `Expected output to match a regex but none was specified.`;

    case "output_not_matches":
      return `Expected output NOT to match /${value}/ but a match was found.`;

    case "tdd":
      return result.error ?? "TDD proof failed. Check the test output above for specific failures.";

    case "manual":
    case "review":
      return `Manual verification required. Run dod_verify to confirm this proof.`;

    case "adversarial": {
      const phase = pred.value !== undefined ? Number(pred.value) : 0;
      return `Adversarial gate for phase ${phase} not GO. ` +
        `Run dod_adversarial_gate to complete the adversarial review for this phase.`;
    }

    case "holdout": {
      const expected = String(pred.value ?? "");
      return `Holdout test fingerprint mismatch. ` +
        `Expected SHA-256 "${expected.slice(0, 16)}..." but got a different value. ` +
        `The holdout test may have been weakened or removed.`;
    }

    case "convergence":
      return `Convergence audit not GO. ` +
        `Run the structural gates and convergence audit to reach stable state.`;

    default:
      return `Proof failed with exit code ${code}. Check the output above.`;
  }
}

// ── Predicate evaluation ──────────────────────────────────────────────────

function evalPredicate(
  predicate: Predicate,
  run: ProofRun,
  output: string,
): { status: LeafResult["status"]; error?: string } {
  const code = run.code ?? -1;

  switch (predicate.type) {
    case "exit_code": {
      const expected = predicate.value !== undefined ? Number(predicate.value) : 0;
      return code === expected
        ? { status: "pass" }
        : { status: "fail", error: `expected exit ${expected} but got ${code}` };
    }

    case "exit_code_not": {
      const forbidden = predicate.value !== undefined ? Number(predicate.value) : 0;
      return code !== forbidden
        ? { status: "pass" }
        : { status: "fail", error: `exit code was ${code} (must not be ${forbidden})` };
    }

    case "output_contains": {
      const needle = String(predicate.value ?? "");
      return output.includes(needle)
        ? { status: "pass" }
        : { status: "fail", error: `output did not contain "${needle}"` };
    }

    case "output_not_contains": {
      const needle = String(predicate.value ?? "");
      return !output.includes(needle)
        ? { status: "pass" }
        : { status: "fail", error: `output contained "${needle}" (must not)` };
    }

    case "output_matches": {
      const pattern = String(predicate.value ?? "");
      try {
        return new RegExp(pattern).test(output)
          ? { status: "pass" }
          : { status: "fail", error: `output did not match /${pattern}/` };
      } catch {
        return { status: "fail", error: `invalid regex: /${pattern}/` };
      }
    }

    case "output_not_matches": {
      const pattern = String(predicate.value ?? "");
      try {
        return !new RegExp(pattern).test(output)
          ? { status: "pass" }
          : { status: "fail", error: `output matched /${pattern}/ (must not match)` };
      } catch {
        return { status: "fail", error: `invalid regex: /${pattern}/` };
      }
    }

    case "holdout": {
      const expected = String(predicate.value ?? "").trim();
      const actual = output.trim();
      // Case-insensitive SHA-256 hex comparison
      return actual.toLowerCase() === expected.toLowerCase()
        ? { status: "pass" }
        : { status: "fail", error: `holdout fingerprint mismatch: expected ${expected.slice(0, 16)}...` };
    }

    // adversarial and convergence are gate checks — evaluated in executeProof
    // via opts.adversarial_gates, not via command output.

    default:
      return { status: "fail", error: `unknown predicate type: ${(predicate as any).type}` };
  }
}

// ── Command execution ─────────────────────────────────────────────────────

async function runCommand(command: string, cwd: string, timeoutMs: number): Promise<ProofRun> {
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c"] : ["-c"];

  // On Windows, wrap the command in single quotes to protect special chars
  const escapedCmd = process.platform === "win32" ? `'${escapeForCmd(command)}'` : command;

  try {
    const { stdout, stderr } = await execFileP(shell, [...shellArgs, escapedCmd], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      windowsHide: true,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? (err.signal !== undefined ? 128 : 1),
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Execute a single proof's command and evaluate its predicate.
 * Returns a LeafResult ready to be inserted into check results.
 */
export async function executeProof(
  node: TaskNode,
  cwd: string,
  _opts: ProofExecutionOptions = {},
): Promise<LeafResult> {
  if (!node.predicate) {
    return { node_path: "", id: node.id, title: node.title, description: node.description ?? "", status: "fail", command: node.command ?? "", error: "No predicate on node" };
  }
  const predicate = node.predicate;
  const timeoutMs = predicate.timeout_ms ?? 120_000;
  const start = Date.now();

  const result: LeafResult = {
    node_path: "",
    id: node.id,
    title: node.title,
    description: node.description ?? "",
    status: "skipped",
    command: node.command ?? "",
  };

  // ── Out-of-band: manual / review ─────────────────────────────────────
  if (predicate.type === "manual" || predicate.type === "review") {
    if (node.manual_result) {
      const fp = perProofFingerprint(node);
      if (node.manual_result.proof_fingerprint === fp) {
        result.status = node.manual_result.answer;
        if (node.manual_result.note) result.error = node.manual_result.note;
        result.duration_ms = Date.now() - start;
        return result;
      }
    }
    // No cached result — skip until dod_verify is called
    result.status = "skipped";
    result.error = `${predicate.type} proof awaiting human verification via dod_verify`;
    result.duration_ms = Date.now() - start;
    return result;
  }

  // ── TDD: run command, check red/green state ──────────────────────────
  if (predicate.type === "tdd") {
    if (!node.command) {
      result.status = "fail";
      result.error = "TDD proof missing command";
      result.duration_ms = Date.now() - start;
      return result;
    }
    const run = await runCommand(node.command, cwd, timeoutMs);
    const elapsed = Date.now() - start;
    result.output = (run.stdout + run.stderr).slice(0, 4000);
    result.exit_code = run.code ?? -1;
    result.duration_ms = elapsed;

    if (!node.seen_failing) {
      if (run.code !== 0 && run.code !== null) {
        result.status = "pass";
        result.error = "RED: test fails as expected — now implement to make it pass.";
        return result;
      }
      result.status = "fail";
      result.error =
        "TDD RED phase: test should have failed first but it passed. " +
        "Check that the test actually exercises new behavior.";
      return result;
    }

    // GREEN phase
    if (run.code === 0) {
      result.status = "pass";
      return result;
    }
    result.status = "fail";
    result.error =
      `TDD GREEN phase: test failed with exit code ${run.code ?? -1}. ` +
      "Implementation is incomplete or broken. Check the test output above.";
    return result;
  }

  // ── Adversarial gate check (no command execution) ────────────────────
  if (predicate.type === "adversarial" || predicate.type === "convergence") {
    const elapsed = Date.now() - start;
    const phase = predicate.value !== undefined ? Number(predicate.value) : 0;
    const gates = _opts.adversarial_gates ?? [];

    // For convergence: look for phase 4 gate specifically
    // For adversarial: look for the specified phase gate
    const searchPhase = predicate.type === "convergence" ? 4 : phase;
    const gate = gates.find(g => g.phase === searchPhase);

    result.duration_ms = elapsed;

    if (!gate) {
      result.status = "fail";
      result.error =
        `${predicate.type} gate: no gate found for phase ${searchPhase}. Run dod_adversarial_gate first.`;
      result.diagnosis = diagnoseFailure(node, result);
      return result;
    }

    if (gate.verdict !== "GO") {
      result.status = "fail";
      result.error = `${predicate.type} gate: verdict is ${gate.verdict} (need GO). ` +
        `${gate.summary}`;
      result.diagnosis = diagnoseFailure(node, result);
      return result;
    }

    result.status = "pass";
    result.output = `Gate phase ${searchPhase}: GO — ${gate.summary}`;
    return result;
  }

  // ── All other predicate types: basic behavioral ──────────────────────
  if (!node.command) {
    result.status = "fail";
    result.error = "Behavioral proof missing command";
    result.duration_ms = Date.now() - start;
    return result;
  }
  const run = await runCommand(node.command, cwd, timeoutMs);
  const elapsed = Date.now() - start;
  const output = run.stdout + run.stderr;
  result.output = output.slice(0, 4000);
  result.exit_code = run.code ?? -1;
  result.duration_ms = elapsed;

  const evaluation = evalPredicate(predicate, run, output);
  result.status = evaluation.status;
  if (evaluation.error) result.error = evaluation.error;

  if (result.status === "fail") {
    result.diagnosis = diagnoseFailure(node, result);
  }

  return result;
}
