import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { npmCommand } from "./npm-command.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PREFLIGHT = readFileSync(join(ROOT, "scripts/ci/preflight-static-analysis.mjs"), "utf8");
const COVERAGE = readFileSync(join(ROOT, "scripts/ci/check-coverage.mjs"), "utf8");
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
    '"format", "--write", "--no-errors-on-unmatched"',
    '"check", "--max-diagnostics=200", "--no-errors-on-unmatched"',
    '"--profile=strict"',
    '"--fail-on=regression"',
    '"--baseline=.github/quality/quality-baseline.json"',
    '"--write-baseline=.github/quality/quality-baseline.json"',
    '"--committed", "HEAD", "--json"',
    '"scripts/ci/check-tests-present.mjs"',
    '"scripts/ci/check-audit.mjs"',
    '"scripts/ci/check-coverage.mjs"',
  ]) {
    assert.ok(PREFLIGHT.includes(fragment), `preflight is missing CI behavior: ${fragment}`);
  }
  assert.match(WORKFLOW, STATIC_ANALYSIS_COMMAND);
  assert.doesNotMatch(PREFLIGHT, NO_UNIVERSAL_TARGET);
});

test("coverage ratchet invokes its installed c8 CLI directly through Node", () => {
  assert.match(COVERAGE, /const C8_CLI = join\(ROOT, "node_modules", "c8", "bin", "c8\.js"\)/);
  assert.match(COVERAGE, /execFileSync\(process\.execPath, \[C8_CLI, \.\.\.c8Args\(pkg, reportDir\)\]/);
  assert.doesNotMatch(COVERAGE, /\n\s+"c8",/);
  assert.doesNotMatch(COVERAGE, /\bnpx\b/);
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
  const remote = join(parent, "origin.git");
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
      'if (args[0] === "exec" && args.includes("check") && process.env.PREFLIGHT_SCENARIO === "biome") {',
      '  process.stdout.write("src/example.ts:1:1 lint/style/useConst\\n");',
      "  process.exitCode = 1;",
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
    "scripts/ci/committed-quality-gate.test.mjs",
    'import test from "node:test"; test("fixture", () => {});\n',
  );
  write(
    root,
    "scripts/ci/preflight-static-analysis.test.mjs",
    'import test from "node:test"; test("fixture", () => {});\n',
  );
  write(root, "scripts/ci/check-tests-present.mjs", 'process.stdout.write("test presence OK\\n");\n');
  write(root, "scripts/ci/check-audit.mjs", 'process.stdout.write("audit OK\\n");\n');
  write(root, "scripts/ci/check-coverage.mjs", 'process.stdout.write("coverage OK\\n");\n');
  write(root, "packages/quality-guard/dist/bundle.js", "");
  write(root, "packages/quality-guard/scripts/check-skips.mjs", "");
  write(
    root,
    "packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs",
    'process.stdout.write("Improvements: 0 current\\n");\n',
  );

  git(root, ["add", "."]);
  git(root, ["commit", "-m", "fixture"]);
  execFileSync("git", ["init", "--bare", "--quiet", remote]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["notes", "--ref=quality-decisions", "add", "-m", "fixture", "HEAD"]);
  git(root, ["push", "--quiet", "origin", "refs/notes/quality-decisions:refs/notes/quality-decisions"]);

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
