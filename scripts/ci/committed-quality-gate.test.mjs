import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const BUNDLE = resolve("packages/quality-guard/dist/bundle.js");
const WORKFLOW = resolve(".github/workflows/ci.yml");
const CODEQL_WORKFLOW = resolve(".github/workflows/codeql.yml");
const CODEQL_CONFIG = resolve(".github/codeql/codeql-config.yml");

test("CI Biome commands use the configured maintained-file coverage", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const commands = workflow.match(/run: npx @biomejs\/biome check[^\n]+/g) ?? [];

  assert.equal(commands.length, 2);
  for (const command of commands) {
    assert.doesNotMatch(command, /packages\/\*\/src|scripts\/ci/);
  }
});

test("static analysis runs the strict structural ratchet without line-length", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const rules = workflow.match(/^\s*QUALITY_RULES:\s*(.+)$/m)?.[1].split(",");
  const strictScans = workflow.match(/--profile=strict/g) ?? [];

  assert.ok(rules, "QUALITY_RULES must remain declared in the workflow");
  assert.equal(rules.includes("line-length"), false, "Biome owns line length");
  assert.equal(strictScans.length, 2, "the ratchet and baseline regeneration must both use the strict profile");
  assert.match(workflow, /--baseline=\.github\/quality\/quality-baseline\.json \\\n\s*--fail-on=regression/);
  assert.match(workflow, /--write-baseline=\.github\/quality\/quality-baseline\.json/);
});

test("static analysis pins actionlint and proves ShellCheck-backed rejection", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const actionlint = "go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12";

  assert.equal(workflow.split(actionlint).length - 1, 2);
  assert.match(workflow, /command -v shellcheck/);
  assert.match(workflow, /actionlint-invalid-shell\.yml/);
  assert.match(workflow, new RegExp(`${actionlint.replaceAll(".", "\\.")}\\n`));
});

test("CodeQL scans source and workflows with the extended security suite", () => {
  const workflow = readFileSync(CODEQL_WORKFLOW, "utf8");
  const config = readFileSync(CODEQL_CONFIG, "utf8");
  const codeqlSha = "fddeee1a7ece751b577e409a89057319e3172939";

  assert.match(workflow, /push:\n\s*branches: \[master\]/);
  assert.match(workflow, /pull_request:\n\s*branches: \[master\]/);
  assert.match(workflow, /language: \[javascript-typescript, actions\]/);
  assert.equal(workflow.split(`github/codeql-action/init@${codeqlSha}`).length - 1, 1);
  assert.equal(workflow.split(`github/codeql-action/analyze@${codeqlSha}`).length - 1, 1);
  assert.match(workflow, /permissions:\n\s*contents: read\n\s*security-events: write/);
  assert.match(config, /uses: security-extended/);
  for (const excluded of ["**/dist/**", "docs/archive/**", "**/fixtures/**", "/target/**"]) {
    assert.match(config, new RegExp(excluded.replaceAll("*", "\\*").replaceAll("/", "\\/")));
  }
});

function git(root, args) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "quality-guard-ci-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "src", "policy"), { recursive: true });
  mkdirSync(join(root, "src", "drivers"), { recursive: true });
  return root;
}

function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["commit", "-m", message]);
}

function committedDecision(root) {
  return spawnSync(process.execPath, [BUNDLE, "check", "--committed", "HEAD", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
}

test("CI command reports REVIEW_REQUIRED for a committed change without a local hook", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, ".github", "quality"), { recursive: true });
    writeFileSync(join(root, ".quality-guard.json"), '{"directTypeLimit":1}\n');
    writeFileSync(join(root, "src", "policy", "rules.ts"), "export class Rules {}\n");
    writeFileSync(join(root, "src", "policy", "other.ts"), "export class Other {}\n");
    writeFileSync(
      join(root, ".github", "quality", "quality-baseline.json"),
      '{"version":2,"profile":"default","total":2,"counts":{"src/policy/rules.ts::dead-export":1,"src/policy/other.ts::dead-export":1},"files":["src/policy/rules.ts","src/policy/other.ts"]}\n',
    );
    commit(root, "base");
    writeFileSync(join(root, "src", "policy", "added.ts"), "export class Added {}\n");
    commit(root, "change without hook");

    const result = committedDecision(root);

    assert.equal(result.status, 2, result.stdout);
    assert.equal(JSON.parse(result.stdout).verdict, "REVIEW_REQUIRED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CI command reports FAIL for a committed dependency boundary violation without a local hook", () => {
  const root = fixture();
  try {
    writeFileSync(
      join(root, ".quality-guard.json"),
      JSON.stringify({
        pathGroups: { policy: ["src/policy/**"], infrastructure: ["src/drivers/**"] },
        dependencyDirections: [{ from: "policy", to: "infrastructure", allowed: false }],
      }),
    );
    writeFileSync(join(root, "src", "policy", "rules.ts"), "export const policy = true;\n");
    writeFileSync(join(root, "src", "drivers", "clock.ts"), "export const clock = true;\n");
    commit(root, "base");
    writeFileSync(
      join(root, "src", "policy", "rules.ts"),
      "import { clock } from '../drivers/clock';\nexport const policy = clock;\n",
    );
    commit(root, "change without hook");

    const result = committedDecision(root);

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).verdict, "FAIL");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
