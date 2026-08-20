import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { EnumeratedScenario } from "./enumerate.js";
import { buildReport, type CoverageGateResult, outcomeRank, type ScenarioReport, summarizeReport } from "./report.js";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "tools", "openspec-dashboard", "__report_test_fixture__");
const TEST_FILE = path.join(FIXTURE_DIR, "sample.test.js");
const RUNNER_CONFIG = path.join(FIXTURE_DIR, "openspec", "test-runners.json");

function scenario(overrides: Partial<EnumeratedScenario>): EnumeratedScenario {
  return {
    id: "dod-guard/coverage-gate::req||scenario",
    group: "openspec-dashboard",
    capability: "coverage-gate",
    requirementTitle: "req",
    scenarioTitle: "scenario",
    intent: "",
    specPath: "openspec/specs/dod-guard/coverage-gate/spec.md",
    ...overrides,
  };
}

before(async () => {
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  await fs.writeFile(
    TEST_FILE,
    [
      'import { test } from "node:test";',
      "",
      "// covers: dod-guard/coverage-gate :: req :: bound-scenario",
      'test("a bound test", () => {});',
      "",
    ].join("\n"),
  );
});

after(async () => {
  await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
});

// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: No test binds a scenario
test("buildReport reports an unbound scenario as unwired", async () => {
  const [report] = await buildReport(REPO_ROOT, [
    scenario({ id: "dod-guard/coverage-gate::req||unbound-scenario", scenarioTitle: "unbound-scenario" }),
  ]);
  assert.equal(report.outcome, "unwired");
  assert.equal(report.binding, undefined);
  assert.match(report.note, /no test binds this scenario/);
});

// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: A marker binds a scenario to a test
test("buildReport reports a bound scenario as bound", async () => {
  const [report] = await buildReport(REPO_ROOT, [
    scenario({ id: "dod-guard/coverage-gate::req||bound-scenario", scenarioTitle: "bound-scenario" }),
  ]);
  assert.equal(report.outcome, "bound");
  assert.equal(report.binding?.verifyCmd, undefined);
  assert.deepEqual(report.binding, {
    testFile: TEST_FILE,
    testName: "a bound test",
    language: "javascript",
    unresolvedReason: "no runner command is configured for javascript test files",
  });
  assert.match(report.note, /no runner command is configured for javascript test files/);
  assert.match(report.note, /bound to/);
});

test("buildReport resolves a configured language runner from the consumer workspace", async () => {
  await fs.mkdir(path.dirname(RUNNER_CONFIG), { recursive: true });
  await fs.writeFile(RUNNER_CONFIG, JSON.stringify({ javascript: "node --test" }));
  const [report] = await buildReport(FIXTURE_DIR, [
    scenario({ id: "dod-guard/coverage-gate::req||bound-scenario", scenarioTitle: "bound-scenario" }),
  ]);
  assert.equal(report.outcome, "bound");
  assert.equal(report.binding?.verifyCmd, 'node --test "sample.test.js"');
  assert.equal(report.binding?.unresolvedReason, undefined);
  assert.match(report.note, /verify with node --test/);
  await fs.rm(path.dirname(RUNNER_CONFIG), { recursive: true, force: true });
});

test("buildReport reports bindings and configured commands for every supported language family", async () => {
  const cases = [
    ["typescript", ".ts", "//", "javascript", "node --test", 'test("TypeScript test", () => {});', "TypeScript test"],
    ["python", ".py", "#", "python", "pytest", "def test_python():\n    assert True", "test_python"],
    ["go", ".go", "//", "go", "go test", "func TestGo(t *testing.T) {}", "TestGo"],
    ["rust", ".rs", "//", "rust", "cargo test", "#[test]\nfn test_rust() {}", "test_rust"],
    ["ruby", ".rb", "#", "ruby", "bundle exec ruby", "def test_ruby()\nend", "test_ruby"],
    ["java", ".java", "//", "java", "./gradlew test", "@Test\npublic void javaTest() {}", "javaTest"],
    ["kotlin", ".kt", "//", "kotlin", "./gradlew test", "@Test\nfun kotlinTest() {}", "kotlinTest"],
    ["shell", ".sh", "#", "shell", "bash", "test_shell() {}", "test_shell"],
  ] as const;
  const testGlobs: Record<string, string[]> = {};
  const runners: Record<string, string> = {};
  const scenarios: EnumeratedScenario[] = [];

  for (const [group, extension, markerPrefix, language, runner, declaration] of cases) {
    const testFile = path.join(FIXTURE_DIR, "language-tests", `${group}${extension}`);
    await fs.mkdir(path.dirname(testFile), { recursive: true });
    await fs.writeFile(
      testFile,
      `${markerPrefix} covers: ${group}/coverage-gate :: configured runner :: ${group} binding\n${declaration}\n`,
    );
    testGlobs[group] = [`language-tests/**/*${extension}`];
    runners[language] = runner;
    scenarios.push(
      scenario({
        id: `${group}/coverage-gate::configured runner||${group} binding`,
        group,
        scenarioTitle: `${group} binding`,
      }),
    );
  }

  await fs.mkdir(path.dirname(RUNNER_CONFIG), { recursive: true });
  await fs.writeFile(path.join(FIXTURE_DIR, "openspec", "test-globs.json"), JSON.stringify(testGlobs));
  await fs.writeFile(RUNNER_CONFIG, JSON.stringify(runners));

  const reports = await buildReport(FIXTURE_DIR, scenarios);
  for (const [group, extension, , language, runner, , testName] of cases) {
    const report = reports.find(({ group: reportGroup }) => reportGroup === group);
    assert.ok(report);
    assert.equal(report.outcome, "bound");
    assert.deepEqual(report.binding, {
      testFile: path.join(FIXTURE_DIR, "language-tests", `${group}${extension}`),
      testName,
      language,
      verifyCmd: `${runner} "language-tests/${group}${extension}"`,
    });
  }
  await fs.rm(path.join(FIXTURE_DIR, "openspec"), { recursive: true, force: true });
});

test("buildReport retains a binding when its runner configuration is malformed", async () => {
  await fs.mkdir(path.dirname(RUNNER_CONFIG), { recursive: true });
  await fs.writeFile(RUNNER_CONFIG, "[");
  const [report] = await buildReport(FIXTURE_DIR, [
    scenario({ id: "dod-guard/coverage-gate::req||bound-scenario", scenarioTitle: "bound-scenario" }),
  ]);
  assert.equal(report.outcome, "bound");
  assert.equal(report.binding?.verifyCmd, undefined);
  assert.equal(report.binding?.unresolvedReason, "openspec/test-runners.json contains invalid JSON");
  await fs.rm(path.dirname(RUNNER_CONFIG), { recursive: true, force: true });
});

test("CoverageGateResult keeps binding and gate metadata structured", () => {
  const result: CoverageGateResult = {
    reports: [
      {
        ...report("dod-guard/coverage-gate::req||bound-scenario", "bound"),
        binding: {
          testFile: "packages/dod-guard/src/cover/report.test.ts",
          testName: "a bound test",
          language: "typescript",
          verifyCmd: "node --test packages/dod-guard/src/cover/report.test.ts",
        },
      },
    ],
    adopted: ["dod-guard/coverage-gate::req||bound-scenario"],
    regressions: [{ scenarioId: "dod-guard/coverage-gate::req||unwired-scenario", before: "bound", now: "unwired" }],
    improved: ["dod-guard/coverage-gate::req||bound-scenario"],
    orphaned: ["dod-guard/coverage-gate::req||removed-scenario"],
    planComplete: 4,
    planBound: 5,
  };

  assert.equal(result.reports[0].binding?.verifyCmd, "node --test packages/dod-guard/src/cover/report.test.ts");
  assert.equal(result.regressions[0].before, "bound");
});

test("outcomeRank orders bound above unwired", () => {
  assert.ok(outcomeRank("bound") > outcomeRank("unwired"));
});

test("outcomeRank treats old baseline values as equivalent to bound", () => {
  assert.equal(outcomeRank("covered-and-integrated"), outcomeRank("bound"));
  assert.equal(outcomeRank("covered-but-not-integrated"), outcomeRank("bound"));
});

test("outcomeRank treats old failed as equivalent to unwired", () => {
  assert.equal(outcomeRank("failed"), outcomeRank("unwired"));
});

function report(scenarioId: string, outcome: ScenarioReport["outcome"]): ScenarioReport {
  return {
    scenarioId,
    group: "g",
    capability: "c",
    requirementTitle: "r",
    scenarioTitle: scenarioId,
    outcome,
    note: "",
  };
}

test("summarizeReport counts each outcome", () => {
  const summary = summarizeReport([report("a", "unwired"), report("b", "unwired"), report("c", "bound")]);
  assert.equal(summary.unwired, 2);
  assert.equal(summary.bound, 1);
});
