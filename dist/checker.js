import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
const execAsync = promisify(exec);
const TIMEOUT_MS = 120_000;
function evaluatePredicate(predicate, exitCode, stdout) {
    switch (predicate.type) {
        case "exit_code":
            return exitCode === predicate.value;
        case "exit_code_not":
            return exitCode !== predicate.value;
        case "output_contains":
            return stdout.includes(predicate.value);
        case "output_matches":
            return new RegExp(predicate.value, "m").test(stdout);
        case "manual":
            return true;
        default:
            return false;
    }
}
async function executeProof(proof, cwd) {
    if (proof.predicate.type === "manual") {
        return {
            id: proof.id,
            description: proof.description,
            status: "skipped",
            command: proof.command,
            output: "Manual verification — skipped by checker",
        };
    }
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
        const duration = Date.now() - start;
        const combined = stdout + stderr;
        const passed = evaluatePredicate(proof.predicate, 0, combined);
        return {
            id: proof.id,
            description: proof.description,
            status: passed ? "pass" : "fail",
            command: proof.command,
            output: combined.slice(0, 4000),
            exit_code: 0,
            duration_ms: duration,
        };
    }
    catch (err) {
        const duration = Date.now() - start;
        const execErr = err;
        const exitCode = execErr.code ?? 1;
        const stdout = (execErr.stdout ?? "");
        const stderr = (execErr.stderr ?? "");
        const combined = stdout + stderr;
        if (execErr.killed) {
            return {
                id: proof.id,
                description: proof.description,
                status: "fail",
                command: proof.command,
                output: `TIMEOUT after ${TIMEOUT_MS}ms`,
                error: "Process killed due to timeout",
                exit_code: exitCode,
                duration_ms: duration,
            };
        }
        // Command-not-found (127 on Unix, 9009 on Windows) always FAILs —
        // a missing binary is never a valid "no matches" result.
        const notFound = exitCode === 127 || exitCode === 9009
            || /not recognized|command not found|no such file/i.test(stderr + (execErr.message ?? ""));
        if (notFound) {
            return {
                id: proof.id,
                description: proof.description,
                status: "fail",
                command: proof.command,
                output: combined.slice(0, 4000),
                error: `Command not found or not executable (exit ${exitCode})`,
                exit_code: exitCode,
                duration_ms: duration,
            };
        }
        const passed = evaluatePredicate(proof.predicate, exitCode, combined);
        return {
            id: proof.id,
            description: proof.description,
            status: passed ? "pass" : "fail",
            command: proof.command,
            output: combined.slice(0, 4000),
            error: stderr.slice(0, 2000) || undefined,
            exit_code: exitCode,
            duration_ms: duration,
        };
    }
}
export async function checkDocument(doc, cwdOverride) {
    const cwd = cwdOverride ?? doc.cwd;
    const stepResults = [];
    let totalPass = 0;
    let totalFail = 0;
    for (const step of doc.steps) {
        const proofResults = [];
        let stepPassed = true;
        for (const proof of step.proofs) {
            const result = await executeProof(proof, cwd);
            proofResults.push(result);
            if (result.status === "fail")
                stepPassed = false;
        }
        // Step with no executable proofs (empty or all-manual) is not "pass"
        const executableCount = step.proofs.filter(p => p.predicate.type !== "manual").length;
        if (executableCount === 0)
            stepPassed = false;
        stepResults.push({
            id: step.id,
            title: step.title,
            status: stepPassed ? "pass" : "fail",
            proofs: proofResults,
        });
        if (stepPassed)
            totalPass++;
        else
            totalFail++;
    }
    // Proof-set fingerprint: hash of all (command, predicate) pairs.
    // If proofs are tampered in the store, the fingerprint changes —
    // humans reviewing the transcript can compare it to the original.
    const fingerprintData = doc.steps.flatMap(s => s.proofs.map(p => `${p.command}|${p.predicate.type}|${p.predicate.value ?? ""}`)).join("\n");
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
//# sourceMappingURL=checker.js.map