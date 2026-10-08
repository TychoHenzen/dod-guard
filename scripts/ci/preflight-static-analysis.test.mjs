import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { main as coverageMain } from "./check-coverage.mjs";
import { npmCommand } from "./npm-command.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PREFLIGHT = readFileSync(join(ROOT, "scripts/ci/preflight-static-analysis.mjs"), "utf8");
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
const STATIC_ANALYSIS_COMMAND =
  /static-analysis:[\s\S]*?name: Run static-analysis preflight\s+run: npm run preflight:static-analysis/;
const QUALITY_RULES_START = "const QUALITY_RULES = [";
const QUALITY_RULES_END = '].join(",");';
const NO_UNIVERSAL_TARGET = /line-count|coverage-percent/;
const PREFLIGHT_PASSED = /Static-analysis preflight passed/;
const GENERATED_PATH = /"generated\.txt"/;
const BIOME_DIAGNOSTIC = /src\/example\.ts:1:1 lint\/style\/useConst/;

test("preflight is CI's single source for generated checks, policy, and Biome flags", () => {
  const ruleSource = PREFLIGHT.split(QUALITY_RULES_START)[1]?.split(QUALITY_RULES_END)[0];
  const rules = ruleSource?.match(/"[^"]+"/g)?.map((rule) => rule.slice(1, -1));
  const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  assert.equal(scripts["preflight:static-analysis"], "node scripts/ci/preflight-static-analysis.mjs");
  assert.ok(rules);
  for (const rule of rules) {
    assert.ok(PREFLIGHT.includes(JSON.stringify(rule)));
  }
  for (const fragment of [
    '["run", "build"]',
    '["run", "bundle"]',
    '["run", "build:test", "--workspaces"]',
    '["run", "prepare:test", "--workspaces", "--if-present"]',
    '"format", "--write", "--no-errors-on-unmatched"',
    '"check", "--max-diagnostics=200", "--no-errors-on-unmatched"',
    '"Quality diagnostics (advisory)"',
    '"scripts/ci/check-tests-present.mjs"',
    '"scripts/ci/check-audit.mjs"',
    '"scripts/ci/check-coverage.mjs"',
  ]) {
    assert.ok(PREFLIGHT.includes(fragment), `preflight is missing CI behavior: ${fragment}`);
  }
  for (const fragment of [
    "quality-baseline",
    "coverage-baseline",
    "audit-baseline",
    "untested-sources",
    "check-skips",
    "--fail-on=",
    "--write-baseline",
    "--profile",
  ]) {
    assert.doesNotMatch(PREFLIGHT, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(PREFLIGHT, /assumption-marker/);
  assert.match(WORKFLOW, STATIC_ANALYSIS_COMMAND);
  assert.doesNotMatch(PREFLIGHT, NO_UNIVERSAL_TARGET);
});

test("coverage diagnostics are report-only and preserve package evidence", () => {
  let output = "";
  const result = coverageMain([], {
    measure: () => ({
      qualityGuard: { statements: 80, branches: 70, functions: 90, lines: 80 },
    }),
    stdout: {
      write: (chunk) => {
        output += chunk;
      },
    },
    stderr: { write: () => {} },
  });
  assert.equal(result, 0);
  assert.match(output, /qualityGuard/);
  assert.match(output, /coverage advisory/);
});

test("standalone CI scripts can invoke npm without npm's injected environment", () => {
  const npmExecPath = process.env.npm_execpath;
  delete process.env.npm_execpath;
  try {
    const command = npmCommand(["--version"]);
    assert.deepEqual(command, {
      command: "npm",
      args: ["--version"],
      shell: process.platform === "win32",
    });
    const result = spawnSync(command.command, command.args, {
      encoding: "utf8",
      shell: command.shell,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    if (npmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = npmExecPath;
  }
});

function git(root, args) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function write(root, file, content) {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "static-analysis-preflight-"));
  const root = join(parent, "repo");
  mkdirSync(root);
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Preflight Test"]);

  write(root, "generated.txt", "committed\n");
  write(root, "package.json", JSON.stringify({ scripts: { build: "node fixture.mjs", bundle: "node fixture.mjs" } }));
  write(
    root,
    "npm-cli.mjs",
    [
      'import { writeFileSync } from "node:fs";',
      'import { join } from "node:path";',
      "const args = process.argv.slice(2);",
      'if (args[0] === "run" && args[1] === "bundle" && process.env.PREFLIGHT_SCENARIO === "drift") writeFileSync(join(process.cwd(), "generated.txt"), "generated\\n");',
      'if (args[0] === "exec" && args.includes("check") && process.env.PREFLIGHT_SCENARIO.startsWith("biome")) {',
      '  const capped = args.includes("--max-diagnostics=200");',
      '  if (process.env.PREFLIGHT_SCENARIO === "biome") process.stdout.write("src/example.ts:1:1 lint/style/useConst\\n");',
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-uncapped") process.stdout.write("src/example.ts:1:1 lint/style/useConst\\n");',
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-capped-error" && capped) {',
      '    process.stdout.write("src/example.ts:1:1 lint/style/useConst\\nDiagnostics not shown: 1\\n");',
      "    process.exitCode = 1;",
      "  }",
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-capped-error" && !capped) {',
      '    process.stdout.write("fallback invoked\\n");',
      '    process.stdout.write("src/hidden.ts:2:3 lint/correctness/noUnusedVariables\\n");',
      "    process.exitCode = 1;",
      "  }",
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-capped-warning" && capped) process.stdout.write("src/example.ts:1:1 lint/style/useConst\\nDiagnostics not shown: 1\\n");',
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-capped-warning" && !capped) process.stdout.write("error-only fallback\\n");',
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-fallback-failure" && capped) {',
      '    process.stdout.write("Diagnostics not shown: 1\\n");',
      "    process.exitCode = 1;",
      "  }",
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-fallback-failure" && !capped) {',
      '    process.stderr.write("fallback failed: fixture\\n");',
      "    process.exitCode = 2;",
      "  }",
      '  if (process.env.PREFLIGHT_SCENARIO === "biome-uncapped") process.exitCode = 0;',
      '  if (process.env.PREFLIGHT_SCENARIO === "biome") process.exitCode = 1;',
      "}",
    ].join("\n"),
  );
  write(root, "fixture.mjs", "");
  write(
    root,
    "scripts/ci/preflight-static-analysis.mjs",
    readFileSync(join(ROOT, "scripts/ci/preflight-static-analysis.mjs")),
  );
  write(root, "scripts/ci/npm-command.mjs", readFileSync(join(ROOT, "scripts/ci/npm-command.mjs")));
  write(
    root,
    "scripts/ci/preflight-static-analysis.test.mjs",
    'import test from "node:test"; test("fixture", () => {});\n',
  );
  write(root, "packages/quality-guard/dist/bundle.js", "");
  write(
    root,
    "packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs",
    'process.stdout.write(JSON.stringify({summary:{total:1,high:1,medium:0,low:0,byRule:{complexity:1},byFile:{"fixture.js":1}},violations:[{rule:"complexity",severity:"high"}]}) + "\\n");\n',
  );

  git(root, ["add", "."]);
  git(root, ["commit", "-m", "fixture"]);

  return { parent, root };
}

function runPreflight(root, scenario = "clean") {
  return spawnSync(process.execPath, ["scripts/ci/preflight-static-analysis.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_execpath: join(root, "npm-cli.mjs"),
      PREFLIGHT_SCENARIO: scenario,
    },
  });
}

test("preflight passes with a clean generated tree", () => {
  const { parent, root } = fixture();
  try {
    const result = runPreflight(root);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, PREFLIGHT_PASSED);
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }), "");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("preflight fails with the exact generated path and leaves it unstaged", () => {
  const { parent, root } = fixture();
  try {
    const result = runPreflight(root, "drift");
    assert.equal(result.status, 1);
    assert.match(result.stderr, GENERATED_PATH);
    assert.equal(execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: root }).length, 0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("preflight preserves Biome diagnostics and returns failure", () => {
  const { parent, root } = fixture();
  try {
    const result = runPreflight(root, "biome");
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, BIOME_DIAGNOSTIC);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("preflight exposes hidden Biome errors after a capped run", () => {
  const { parent, root } = fixture();
  try {
    const result = runPreflight(root, "biome-capped-error");
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1, output);
    assert.match(output, /src\/example\.ts:1:1 lint\/style\/useConst/);
    assert.match(output, /src\/hidden\.ts:2:3 lint\/correctness\/noUnusedVariables/);
    assert.equal((output.match(/fallback invoked/g) ?? []).length, 1);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("preflight does not run the Biome fallback without a cap", () => {
  const { parent, root } = fixture();
  try {
    const result = runPreflight(root, "biome-uncapped");
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.match(output, BIOME_DIAGNOSTIC);
    assert.doesNotMatch(output, /Biome error diagnostics/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("preflight keeps warning-only capped Biome runs successful", () => {
  const { parent, root } = fixture();
  try {
    const result = runPreflight(root, "biome-capped-warning");
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.match(output, /Diagnostics not shown: 1/);
    assert.match(output, /error-only fallback/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("preflight exposes a Biome fallback failure", () => {
  const { parent, root } = fixture();
  try {
    const result = runPreflight(root, "biome-fallback-failure");
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1, output);
    assert.match(output, /fallback failed: fixture/);
    assert.match(output, /Biome strict check exited with status 1/);
    assert.match(output, /Biome error diagnostics exited with status 2/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("preflight refuses a dirty checkout before running generators", () => {
  const { parent, root } = fixture();
  try {
    writeFileSync(join(root, "generated.txt"), "local edit\n");
    const result = runPreflight(root, "drift");
    assert.equal(result.status, 1);
    assert.match(result.stderr, GENERATED_PATH);
    assert.equal(readFileSync(join(root, "generated.txt"), "utf8"), "local edit\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
