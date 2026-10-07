import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runPowerShell } from "./maintenance-harness.mjs";
import { releaseVerificationPath, runReleaseVerification } from "./release-harness.mjs";

test("release verification parses and proves the complete read-only evidence boundary", {
  skip: process.platform !== "win32",
}, async () => {
  const helper = await readFile(releaseVerificationPath, "utf8");
  const parse = runPowerShell(
    "$tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile($env:DOD_GUARD_RELEASE_VERIFICATION, [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }",
    { DOD_GUARD_RELEASE_VERIFICATION: releaseVerificationPath },
  );
  assert.equal(parse.status, 0, `${parse.stdout}\n${parse.stderr}`);
  assert.doesNotMatch(helper, /\|\s*ForEach-Object[^\r\n]*-join/);

  const outcome = runReleaseVerification();
  assert.equal(outcome.Success, true);
  assert.equal(outcome.Stage, "complete");
  assert.equal(outcome.Git.RemoteHead, outcome.PublishedSha);
  assert.deepEqual(outcome.RequiredChecks.Names, [
    "build-test",
    "plugin-config",
    "static-analysis",
    "package-integrity",
  ]);
  assert.equal(outcome.Protection.AdminEnabled, true);
  assert.equal(outcome.Clients.codex.Version, "5.4.56");
  assert.equal(outcome.Clients.codex.PluginIdentity.pluginId, "dod-guard@dod-guard-monorepo");
  assert.equal(outcome.Clients.claude.PluginIdentity.id, "dod-guard@dod-guard");
  assert.equal(outcome.Commands["git-head"].ExitCode, 0);
  assert.equal(outcome.Commands["claude-preflight"].ExitCode, 0);
});

test("release verification fails closed before parsing incomplete or mismatched evidence", {
  skip: process.platform !== "win32",
}, () => {
  const cases = [
    ["command", /git-head failed with exit code 7/, "git-head", 7],
    ["head", /current Git HEAD/, "git-head", 0],
    ["parent", /published commit parent/, "git-parent", 0],
    ["remote", /remote master/, "git-remote", 0],
    ["malformed", /protection returned malformed JSON/, "protection", 0],
    ["checks", /required check package-integrity is missing/, "required-checks", 0],
    ["duplicate-check", /required check build-test has ambiguous duplicate runs/, "required-checks", 0],
    ["version", /codex registration version/, "codex-preflight", 0],
    ["identity", /Codex registration identity/, "codex-preflight", 0],
    ["preflight-malformed", /codex installation preflight returned malformed JSON/, "codex-preflight", 0],
    ["inventory", /claude-inventory failed with exit code 9/, "claude-inventory", 9],
  ];
  for (const [failureStage, errorPattern, commandName, exitCode] of cases) {
    const outcome = runReleaseVerification(failureStage);
    assert.equal(outcome.Success, false, failureStage);
    assert.match(outcome.Error, errorPattern, failureStage);
    assert.equal(outcome.Commands[commandName].ExitCode, exitCode, failureStage);
  }
});
