import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const BUNDLE = resolve("packages/quality-guard/dist/bundle.js");
const WORKFLOW = resolve(".github/workflows/ci.yml");
const PREFLIGHT = resolve("scripts/ci/preflight-static-analysis.mjs");
const CODEQL_WORKFLOW = resolve(".github/workflows/codeql.yml");
const CODEQL_CONFIG = resolve(".github/codeql/codeql-config.yml");

test("CI uses the repository preflight for maintained-file Biome checks", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  const preflight = readFileSync(PREFLIGHT, "utf8");

  assert.match(workflow, /name: Run static-analysis preflight\s+run: npm run preflight:static-analysis/);
  assert.match(preflight, /"format", "--write", "--no-errors-on-unmatched"/);
  assert.match(preflight, /"check", "--max-diagnostics=200", "--no-errors-on-unmatched"/);
});

test("static analysis runs the strict structural ratchet without line-length", () => {
  const preflight = readFileSync(PREFLIGHT, "utf8");
  const ruleSource = preflight.split("const QUALITY_RULES = [")[1]?.split('].join(",");')[0];
  const rules = ruleSource?.match(/"[^"]+"/g)?.map((rule) => rule.slice(1, -1));
  const strictScans = preflight.match(/--profile=strict/g) ?? [];

  assert.ok(rules, "QUALITY_RULES must remain declared in the preflight");
  assert.equal(rules.includes("line-length"), false, "Biome owns line length");
  assert.equal(strictScans.length, 2, "the ratchet and baseline regeneration must both use the strict profile");
  assert.match(preflight, /--baseline=\.github\/quality\/quality-baseline\.json/);
  assert.match(preflight, /--fail-on=regression/);
  assert.match(preflight, /--write-baseline=\.github\/quality\/quality-baseline\.json/);
  assert.match(preflight, /QUALITY_GUARD_SKIP_STRUCTURAL: "1"/);
});

test("static analysis fetches optional quality decision notes before committed replay", () => {
  const preflight = readFileSync(PREFLIGHT, "utf8");
  const fetchIndex = preflight.indexOf(
    '["fetch", "origin", "refs/notes/quality-decisions:refs/notes/quality-decisions"]',
  );
  const gateIndex = preflight.indexOf('"Committed-tree quality decision"');
  assert.notEqual(fetchIndex, -1, "preflight must fetch quality decision notes");
  assert.notEqual(gateIndex, -1, "preflight must run the committed quality gate");
  assert.ok(fetchIndex < gateIndex);
  assert.match(preflight, /couldn't find remote ref refs\/notes\/quality-decisions/);
  assert.match(preflight, /No quality decision notes ref is published/);
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
