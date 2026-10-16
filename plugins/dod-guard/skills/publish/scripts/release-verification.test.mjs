import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parsePowerShellFile, runPowerShell } from "./maintenance-harness.mjs";
import { releaseVerificationPath, runReleaseVerification } from "./release-harness.mjs";

// A throwaway plugin root holding a copy of the real preflight helper, so the inventory-status
// rule under test is not re-implemented in the PowerShell stub.
async function createRealHelperFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dod-guard-release-helper-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const helper = join(root, "skills", "publish", "scripts", "preflight-installation.mjs");
  const manifest = JSON.stringify({ name: "dod-guard", version: "5.4.56" });
  await mkdir(join(root, "skills", "publish", "scripts"), { recursive: true });
  await mkdir(join(root, ".codex-plugin"), { recursive: true });
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await Promise.all([
    copyFile(fileURLToPath(new URL("./preflight-installation.mjs", import.meta.url)), helper),
    writeFile(join(root, "skills", "publish", "SKILL.md"), "# publish fixture\n"),
    writeFile(join(root, ".codex-plugin", "plugin.json"), manifest),
    writeFile(join(root, ".claude-plugin", "plugin.json"), manifest),
  ]);
  return { root, helper };
}

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
}, async (t) => {
  const realHelper = await createRealHelperFixture(t);
  const cases = [
    ["command", /git-head failed with exit code 7: fatal: not a git repository/, "git-head", 7],
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
  ];
  for (const [failureStage, errorPattern, commandName, exitCode] of cases) {
    const fixture = failureStage === "inventory" ? realHelper : undefined;
    const outcome = runReleaseVerification(failureStage, fixture);
    assert.equal(outcome.Success, false, failureStage);
    assert.match(outcome.Error, errorPattern, failureStage);
    assert.equal(outcome.Commands[commandName].ExitCode, exitCode, failureStage);
    if (failureStage === "inventory") assert.equal(outcome.Stage, "claude-preflight", failureStage);
  }
});

test("a non-zero codex inventory is judged by the real preflight helper", {
  skip: process.platform !== "win32",
}, async (t) => {
  const fixture = await createRealHelperFixture(t);

  const tolerated = runReleaseVerification("codex-inventory-nonzero", fixture);
  assert.equal(tolerated.Success, true, tolerated.Error);
  assert.equal(tolerated.Stage, "complete");
  assert.equal(tolerated.Commands["codex-inventory"].ExitCode, 1);
  assert.equal(tolerated.Commands["codex-inventory"].StderrPresent, true);
  assert.equal(tolerated.Clients.codex.InventoryStatus, 1);
  assert.equal(tolerated.Clients.codex.PluginIdentity.pluginId, "dod-guard@dod-guard-monorepo");

  for (const failureStage of ["codex-inventory-nonzero-missing", "codex-inventory-nonzero-malformed"]) {
    const rejected = runReleaseVerification(failureStage, fixture);
    assert.equal(rejected.Success, false, failureStage);
    assert.equal(rejected.Stage, "codex-preflight", failureStage);
    assert.match(rejected.Error, /codex-preflight failed with exit code 1/, failureStage);
    assert.equal(rejected.Commands["codex-inventory"].ExitCode, 1, failureStage);
  }
});

test("the shared native command helper keeps stderr out of stdout and returns the real exit status", {
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
  const publishNativeCommandPath = fileURLToPath(new URL("./publish-native-command.ps1", import.meta.url));
  const command = String.raw`$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_NATIVE_COMMAND
$result = Invoke-PublishNativeCommand node @($env:DOD_GUARD_NATIVE_SCRIPT) $null
$result | ConvertTo-Json -Depth 5 -Compress
`;
  const result = runPowerShell(command, {
    DOD_GUARD_NATIVE_COMMAND: publishNativeCommandPath,
    DOD_GUARD_NATIVE_SCRIPT: script,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const captured = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(captured.ExitCode, 3);
  assert.equal(captured.Output, '{"installed":[]}');
  assert.equal(captured.Stderr, "warn");
});

test("the shared failure message names the exit code and appends stderr only when present", {
  skip: process.platform !== "win32",
}, () => {
  const command = String.raw`$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_NATIVE_COMMAND
$with = Get-PublishNativeFailureMessage 'git push' 5 'rejected'
$without = Get-PublishNativeFailureMessage 'git push' 5 ''
@{ With = $with; Without = $without } | ConvertTo-Json -Compress
`;
  const result = runPowerShell(command, {
    DOD_GUARD_NATIVE_COMMAND: fileURLToPath(new URL("./publish-native-command.ps1", import.meta.url)),
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const messages = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(messages.With, "git push failed with exit code 5: rejected");
  assert.equal(messages.Without, "git push failed with exit code 5");
});
