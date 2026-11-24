import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { writeTree } from "./formatter-width-test-support.mjs";
import { pullRequest, runGate } from "./quality-pr-gate-cli-test-support.mjs";

const SCANNER = fileURLToPath(
  new URL(
    "../../../../../skills/quality-refactor/scripts/quality-scan.mjs",
    import.meta.url,
  ),
);

// A class nothing references, which a container builds because of [Service].
const REGISTRY = {
  // biome-ignore lint/security/noSecrets: C# source text, not a secret
  "Scripts/Registry.cs": "[Service]\npublic partial class Registry : Node {}\n",
};
const REGISTER_SERVICE = '{"registeredAttributes":["Service"]}';
const USAGE_ERROR = 3;
const BAD_FLAG = /--registered-attribute: Godot\.Service/;
const REGISTRY_FINDING = /Registry/;

function scan(t, files, flags = []) {
  const root = mkdtempSync(join(tmpdir(), "quality-scan-registered-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeTree(root, files);
  return spawnSync(
    process.execPath,
    [SCANNER, ".", `--root=${root}`, "--format=json", ...flags],
    { encoding: "utf8" },
  );
}

function deadExports(result) {
  if (result.status !== 0) {
    throw new Error(`scan exited ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout)
    .violations.filter((violation) => violation.rule === "dead-export")
    .map((violation) => violation.file);
}

test("the scanner reads registeredAttributes from .quality-guard.json", (t) => {
  const files = { ...REGISTRY, ".quality-guard.json": REGISTER_SERVICE };
  assert.deepEqual(deadExports(scan(t, files)), []);
});

test("--no-config drops the setting, and the flag restores it", (t) => {
  const files = { ...REGISTRY, ".quality-guard.json": REGISTER_SERVICE };
  assert.deepEqual(deadExports(scan(t, files, ["--no-config"])), [
    "Scripts/Registry.cs",
  ]);
  const flagged = ["--no-config", "--registered-attribute=Service"];
  assert.deepEqual(deadExports(scan(t, files, flagged)), []);
});

test("a flag value that is not a plain name exits 3", (t) => {
  const result = scan(t, REGISTRY, ["--registered-attribute=Godot.Service"]);
  assert.equal(result.status, USAGE_ERROR);
  assert.match(result.stderr, BAD_FLAG);
});

test("the gate applies the merge base's registered attributes", (t) => {
  const repo = pullRequest(t, {
    base: { ".quality-guard.json": REGISTER_SERVICE, "src/a.js": "x();\n" },
    head: REGISTRY,
  });
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
});

test("a pull request cannot register its own attribute", (t) => {
  const repo = pullRequest(t, {
    base: { "src/a.js": "x();\n" },
    head: { ...REGISTRY, ".quality-guard.json": REGISTER_SERVICE },
  });
  const result = runGate(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, REGISTRY_FINDING);
});
