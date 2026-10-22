import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runPowerShell } from "./maintenance-harness.mjs";

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
