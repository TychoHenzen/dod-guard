import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parsePowerShellFile, runPowerShell } from "./maintenance-harness.mjs";
import { releaseVerificationPath, runReleaseVerification } from "./release-harness.mjs";

test("release verification parses and proves the complete read-only evidence boundary", {
  skip: process.platform !== "win32",
}, async () => {
  const helper = await readFile(releaseVerificationPath, "utf8");
  const parse = parsePowerShellFile(releaseVerificationPath);
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
    ["inventory", /claude-preflight failed with exit code 1/, "claude-inventory", 9],
    ["codex-inventory-nonzero-missing", /codex-preflight failed with exit code 1/, "codex-inventory", 1],
    ["codex-inventory-nonzero-malformed", /codex-preflight failed with exit code 1/, "codex-inventory", 1],
  ];
  for (const [failureStage, errorPattern, commandName, exitCode] of cases) {
    const outcome = runReleaseVerification(failureStage);
    assert.equal(outcome.Success, false, failureStage);
    assert.match(outcome.Error, errorPattern, failureStage);
    assert.equal(outcome.Commands[commandName].ExitCode, exitCode, failureStage);
    if (failureStage === "inventory") assert.equal(outcome.Stage, "claude-preflight", failureStage);
    if (failureStage.startsWith("codex-inventory-nonzero"))
      assert.equal(outcome.Stage, "codex-preflight", failureStage);
  }
});

test("a non-zero codex inventory is tolerated only when the helper accepts the captured registry", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runReleaseVerification("codex-inventory-nonzero");
  assert.equal(outcome.Success, true, outcome.Error);
  assert.equal(outcome.Stage, "complete");
  assert.equal(outcome.Commands["codex-inventory"].ExitCode, 1);
  assert.equal(outcome.Commands["codex-inventory"].StderrPresent, true);
  assert.equal(outcome.Clients.codex.InventoryStatus, 1);
  assert.equal(outcome.Clients.codex.PluginIdentity.pluginId, "dod-guard@dod-guard-monorepo");
});

test("the native command helper keeps stderr out of stdout and returns the real exit status", {
  skip: process.platform !== "win32",
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dod-guard-release-native-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, "native.mjs");
  await writeFile(
    script,
    ["process.stdout.write('{\"installed\":[]}\\n');", "process.stderr.write('warn\\n');", "process.exit(3);"].join(
      "\n",
    ),
  );
  const command = String.raw`$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_RELEASE_VERIFICATION
$result = Invoke-ReleaseVerificationNativeCommand node @($env:DOD_GUARD_NATIVE_SCRIPT) $null
$result | ConvertTo-Json -Depth 5 -Compress
`;
  const result = runPowerShell(command, {
    DOD_GUARD_RELEASE_VERIFICATION: releaseVerificationPath,
    DOD_GUARD_NATIVE_SCRIPT: script,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const captured = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(captured.ExitCode, 3);
  assert.equal(captured.Output, '{"installed":[]}');
  assert.equal(captured.Stderr, "warn");
});
