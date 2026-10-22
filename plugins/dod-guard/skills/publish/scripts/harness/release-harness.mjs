import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runPowerShell } from "../maintenance-harness.mjs";

export const releaseVerificationPath = fileURLToPath(new URL("../release-verification.ps1", import.meta.url));

// The PowerShell text lives in data files: it is not JavaScript, and an embedded copy would hold
// this module over the file-length limit. The three parts load in order and join with no separator.
// DOD_GUARD_FAILURE_STAGE picks the evidence a test corrupts.
const HARNESS = ["release-harness.ps1", "release-harness-invoke.ps1", "release-harness-answers.ps1"]
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
  .join("");

// With a fixture, the node command runs the real preflight-installation.mjs; see
// harness/real-helper-fixture.mjs for how the throwaway plugin root is built.
export function runReleaseVerification(failureStage = "", fixture) {
  const result = runPowerShell(HARNESS, {
    DOD_GUARD_RELEASE_VERIFICATION: releaseVerificationPath,
    DOD_GUARD_FAILURE_STAGE: failureStage,
    DOD_GUARD_FIXTURE_ROOT: fixture?.root ?? "",
    DOD_GUARD_FIXTURE_HELPER: fixture?.helper ?? "",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines.at(-1));
}
