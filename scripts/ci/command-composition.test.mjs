import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mutationState } from "./command-composition-fixtures.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CONTRACT = join(ROOT, "docs", "command-composition.md");
const PLUGIN_CONTRACT = join(ROOT, "plugins", "dod-guard", "docs", "command-composition.md");
const FIXTURE = join(ROOT, "scripts", "ci", "command-composition-fixtures.mjs");
const OUTPUT_LINE_COUNT = 120;
const DISPLAY_LINE_COUNT = 45;
const CONTRACT_LINK = /command-composition\.md/;
const LITERAL_PACKAGE_GLOB = /packages\/\*\/src\//;
const RTK_HEAD_PIPE = /rtk[^\r\n]*\|\s*head(?:\s|$)/u;
const COLLAPSED_BIOME_PATHS = /@biomejs\/biome[^\r\n]*\$changed/u;
const PATH_EXPANSION_ERROR = /path expansion/;
const SEPARATE_ARGUMENTS_ERROR = /separate arguments/;
const MISSING_PACKAGE_ERROR = /missing required package argument/;
const DESTINATION_PARENT_ERROR = /destination parent missing/;
const POLICY_REFUSAL_ERROR = /refused before execution/;
const PATCH_BOUNDARY_ERROR = /must end with/;
const LINE_BREAK = /\r?\n/;
const GUIDANCE = [
  "AGENTS.md",
  "plugins/dod-guard/USAGE.md",
  "docs/handoffs/2026-08-30-serena-code-explorer.md",
  "plugins/dod-guard/skills/next-ticket/SKILL.md",
  "plugins/dod-guard/skills/submit-draft-pr/SKILL.md",
  "plugins/dod-guard/skills/complete-pr/SKILL.md",
  "plugins/dod-guard/skills/review-pr/SKILL.md",
  "plugins/dod-guard/skills/publish/SKILL.md",
];
const SHIPPED_GUIDANCE = [
  "plugins/dod-guard/USAGE.md",
  "plugins/dod-guard/skills/next-ticket/SKILL.md",
  "plugins/dod-guard/skills/submit-draft-pr/SKILL.md",
  "plugins/dod-guard/skills/complete-pr/SKILL.md",
  "plugins/dod-guard/skills/review-pr/SKILL.md",
  "plugins/dod-guard/skills/publish/SKILL.md",
];

function runFixture(args) {
  return spawnSync(process.execPath, [FIXTURE, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
  });
}

function tempWorkspace() {
  return mkdtempSync(join(process.env.TEMP ?? process.env.TMPDIR ?? ".", "command-composition-"));
}

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("the contract defines shell, native, path, output, and precondition boundaries", () => {
  const contract = readFileSync(CONTRACT, "utf8");
  assert.equal(readFileSync(PLUGIN_CONTRACT, "utf8"), contract, "plugin contract must match repository contract");
  for (const fragment of [
    "Windows PowerShell",
    "Native executable",
    "POSIX shell",
    "explicitly selected",
    "separate arguments",
    "Select-Object -First 45",
    "required positional arguments",
    "destination parents",
    "pre-execution stop",
    "*** End Patch",
  ]) {
    assert.ok(contract.includes(fragment), `contract is missing ${fragment}`);
  }
});

test("shipped plugin guidance resolves the shipped contract", () => {
  for (const path of SHIPPED_GUIDANCE) {
    const source = read(path);
    const link = source.match(/\]\(([^)]*command-composition\.md)\)/u)?.[1];
    assert.ok(link, `${path} must link the command-composition contract`);
    assert.equal(resolve(ROOT, dirname(path), link), PLUGIN_CONTRACT, `${path} must resolve the shipped contract`);
    assert.ok(existsSync(resolve(ROOT, dirname(path), link)), `${path} target must exist`);
  }
});

test("affected entry points link the contract and contain no retired fragile forms", () => {
  for (const path of GUIDANCE) {
    const source = read(path);
    assert.match(source, CONTRACT_LINK, `${path} must link the contract`);
    assert.doesNotMatch(source, LITERAL_PACKAGE_GLOB, `${path} contains a literal package glob`);
    assert.doesNotMatch(source, RTK_HEAD_PIPE, `${path} closes an RTK producer with head`);
    assert.doesNotMatch(source, COLLAPSED_BIOME_PATHS, `${path} passes a collapsed path array`);
  }
});

test("path fixtures reject wildcard and collapsed forms but preserve explicit argv", () => {
  const rejected = runFixture(["paths", "packages/*/src"]);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, PATH_EXPANSION_ERROR);

  const collapsed = runFixture(["paths", "packages/quality-guard/src/"]);
  assert.equal(collapsed.status, 2);
  assert.match(collapsed.stderr, SEPARATE_ARGUMENTS_ERROR);

  const paths = [
    "packages/code-explorer/src/",
    "packages/fossil/src/",
    "packages/knowledge-base/src/",
    "packages/quality-guard/src/",
    "scripts/ci/",
  ];
  const accepted = runFixture(["paths", ...paths]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(JSON.parse(accepted.stdout).paths, paths);
});

test("bounded output captures the producer before selecting displayed lines", () => {
  const result = runFixture(["output"]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(LINE_BREAK);
  assert.equal(lines.length, OUTPUT_LINE_COUNT);
  assert.deepEqual(
    lines.slice(0, DISPLAY_LINE_COUNT),
    Array.from({ length: DISPLAY_LINE_COUNT }, (_, index) => `line-${index + 1}`),
  );
});

test("required arguments fail before execution and succeed when supplied", () => {
  const rejected = runFixture(["required"]);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, MISSING_PACKAGE_ERROR);

  const accepted = runFixture(["required", "knowledge-base"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(JSON.parse(accepted.stdout), { package: "knowledge-base" });
});

test("missing destination parents preserve mutation state until preflight passes", () => {
  const workspace = tempWorkspace();
  try {
    const source = join(workspace, "source.txt");
    const destination = join(workspace, "nested", "destination.txt");
    writeFileSync(source, "source\n");
    const before = mutationState([source, destination]);
    const rejected = runFixture(["destination", source, destination]);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, DESTINATION_PARENT_ERROR);
    assert.deepEqual(mutationState([source, destination]), before);

    mkdirSync(dirname(destination), { recursive: true });
    const accepted = runFixture(["destination", source, destination]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(mutationState([source, destination])[0].exists, false);
    assert.equal(mutationState([source, destination])[1].content, "source\n");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("policy refusal leaves cleanup state unchanged and the safe probe is explicit", () => {
  const workspace = tempWorkspace();
  try {
    const marker = join(workspace, "marker.txt");
    const before = mutationState([marker]);
    const rejected = runFixture(["policy", "recursive-cleanup", marker]);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, POLICY_REFUSAL_ERROR);
    assert.deepEqual(mutationState([marker]), before);

    const accepted = runFixture(["policy", "safe-probe", marker]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(mutationState([marker])[0].content, "safe probe\n");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("patch wrappers reject a trailing newline and accept the exact boundary", () => {
  const rejected = runFixture(["patch", "*** Begin Patch\n*** End Patch\n"]);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, PATCH_BOUNDARY_ERROR);

  const accepted = runFixture(["patch", "*** Begin Patch\n*** End Patch"]);
  assert.equal(accepted.status, 0, accepted.stderr);
});

test("selected Windows PowerShell and Git Bash boundaries execute directly", (t) => {
  if (process.platform !== "win32") {
    return t.skip("Windows shell boundary");
  }
  const powershell = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
  if (!(existsSync(powershell) && existsSync(gitBash))) {
    return t.skip("required shell not installed");
  }
  const ps = spawnSync(
    powershell,
    ["-NoProfile", "-NonInteractive", "-Command", "if (-not $false) { exit 0 }; exit 1"],
    { encoding: "utf8", shell: false },
  );
  assert.equal(ps.status, 0, ps.stderr);
  const wrongBoundary = spawnSync(
    powershell,
    ["-NoProfile", "-NonInteractive", "-Command", "Write-Output one && Write-Output two"],
    { encoding: "utf8", shell: false },
  );
  assert.notEqual(wrongBoundary.status, 0);
  const bash = spawnSync(gitBash, ["-lc", 'test "$1" = ok', "--", "ok"], { encoding: "utf8", shell: false });
  assert.equal(bash.status, 0, bash.stderr);
});
