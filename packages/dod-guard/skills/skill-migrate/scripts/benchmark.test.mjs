import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateScenario, validateScenariosDir, aggregateResults, toCompareRunsFormat } from "./benchmark.mjs";

const CLI_PATH = fileURLToPath(new URL("./benchmark.mjs", import.meta.url));

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeScenario(dir, name, content) {
  writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

describe("validateScenario", () => {
  it("flags a scenario missing the id field", () => {
    const { valid, issues } = validateScenario({
      prompt: "fix it",
      fixtures: { files: { "src/a.js": "inline:const a = 1;\n" } },
    });
    assert.equal(valid, false);
    assert.ok(issues.some((i) => i.includes("id")));
  });

  it("flags a scenario missing the prompt field", () => {
    const { valid, issues } = validateScenario({
      id: "case-1",
      fixtures: { files: { "src/a.js": "inline:const a = 1;\n" } },
    });
    assert.equal(valid, false);
    assert.ok(issues.some((i) => i.includes("prompt")));
  });

  it("flags a fixture value with neither inline: nor copy: prefix", () => {
    const { valid, issues } = validateScenario({
      id: "case-1",
      prompt: "fix it",
      fixtures: { files: { "src/a.js": "const a = 1;\n" } },
    });
    assert.equal(valid, false);
    assert.ok(issues.some((i) => i.includes('"inline:" or "copy:"')));
  });

  it("flags a copy: fixture whose source file does not exist", () => {
    const { valid, issues } = validateScenario({
      id: "case-1",
      prompt: "fix it",
      fixtures: { files: { "src/a.js": "copy:/definitely/not/a/real/path.js" } },
    });
    assert.equal(valid, false);
    assert.ok(issues.some((i) => i.includes("does not exist")));
  });

  it("passes a scenario with only inline: fixtures", () => {
    const { valid, issues } = validateScenario({
      id: "case-1",
      prompt: "fix it",
      fixtures: { files: { "src/a.js": "inline:const a = 1;\n", "oracle/a.js": "inline:const a = 1;\n" } },
    });
    assert.deepEqual(issues, []);
    assert.equal(valid, true);
  });

  it("passes a copy: fixture whose source file exists", () => {
    const dir = tempDir("benchmark-copy-src-");
    try {
      const srcFile = join(dir, "source.js");
      writeFileSync(srcFile, "const a = 1;\n");
      const { valid } = validateScenario({
        id: "case-1",
        prompt: "fix it",
        fixtures: { files: { "src/a.js": `copy:${srcFile}` } },
      });
      assert.equal(valid, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("validateScenariosDir (dry-run mode)", () => {
  it("reports all valid scenarios with zero invalid", () => {
    const dir = tempDir("benchmark-scenarios-valid-");
    try {
      writeScenario(dir, "one.json", {
        id: "one",
        prompt: "fix it",
        fixtures: { files: { "src/a.js": "inline:const a = 1;\n" } },
      });
      writeScenario(dir, "two.json", {
        id: "two",
        prompt: "fix it too",
        fixtures: { files: { "src/b.js": "inline:const b = 2;\n" } },
      });
      const { count, results } = validateScenariosDir(dir);
      assert.equal(count, 2);
      assert.ok(results.every((r) => r.valid));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("catches a scenario missing the id field among otherwise valid ones", () => {
    const dir = tempDir("benchmark-scenarios-invalid-");
    try {
      writeScenario(dir, "good.json", {
        id: "good",
        prompt: "fix it",
        fixtures: { files: { "src/a.js": "inline:const a = 1;\n" } },
      });
      writeScenario(dir, "bad.json", {
        prompt: "no id here",
        fixtures: { files: { "src/a.js": "inline:const a = 1;\n" } },
      });
      const { count, results } = validateScenariosDir(dir);
      assert.equal(count, 2);
      const bad = results.find((r) => r.file === "bad.json");
      assert.equal(bad.valid, false);
      assert.ok(bad.issues.some((i) => i.includes("id")));
      const good = results.find((r) => r.file === "good.json");
      assert.equal(good.valid, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("catches malformed JSON", () => {
    const dir = tempDir("benchmark-scenarios-malformed-");
    try {
      writeScenario(dir, "broken.json", "{ this is not valid json");
      const { count, results } = validateScenariosDir(dir);
      assert.equal(count, 1);
      assert.equal(results[0].valid, false);
      assert.ok(results[0].issues.some((i) => i.includes("invalid JSON")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("aggregateResults", () => {
  it("computes means and totals across mock per-scenario results", () => {
    const scenarioResults = [
      {
        id: "a",
        grade: { passed: 3, failed: 1, total: 4, pass_rate: 0.75 },
        properties: [
          { file: "a.js", syntax_valid: true, behavior_score: 0.9, mutations_fixed: { fixed: 2, total: 3 } },
        ],
        timing: { tokens: 1000, duration_ms: 5000 },
      },
      {
        id: "b",
        grade: { passed: 2, failed: 2, total: 4, pass_rate: 0.5 },
        properties: [
          { file: "b.js", syntax_valid: false, behavior_score: 0.4, mutations_fixed: { fixed: 1, total: 2 } },
        ],
        timing: { tokens: 2000, duration_ms: 7000 },
      },
    ];

    const aggregate = aggregateResults(scenarioResults);

    assert.equal(aggregate.mean_pass_rate, 0.625);
    assert.ok(Math.abs(aggregate.mean_behavior_score - 0.65) < 1e-9);
    assert.equal(aggregate.total_mutations_fixed, 3);
    assert.equal(aggregate.total_mutations, 5);
    assert.equal(aggregate.mutations_fixed_rate, 3 / 5);
    assert.equal(aggregate.syntax_valid_count, 1);
    assert.equal(aggregate.syntax_invalid_count, 1);
    assert.equal(aggregate.mean_tokens, 1500);
    assert.equal(aggregate.mean_duration_ms, 6000);
  });

  it("handles an empty result set without dividing by zero", () => {
    const aggregate = aggregateResults([]);
    assert.equal(aggregate.mean_pass_rate, 0);
    assert.equal(aggregate.mean_behavior_score, 0);
    assert.equal(aggregate.total_mutations_fixed, 0);
    assert.equal(aggregate.total_mutations, 0);
    assert.equal(aggregate.mutations_fixed_rate, 0);
    assert.equal(aggregate.syntax_valid_count, 0);
    assert.equal(aggregate.syntax_invalid_count, 0);
    assert.equal(aggregate.mean_tokens, 0);
    assert.equal(aggregate.mean_duration_ms, 0);
  });

  it("skips scenarios with no grade when computing mean_pass_rate", () => {
    const scenarioResults = [
      { id: "a", grade: null, properties: [], timing: { tokens: 100, duration_ms: 100 } },
      {
        id: "b",
        grade: { passed: 1, failed: 0, total: 1, pass_rate: 1 },
        properties: [],
        timing: { tokens: 200, duration_ms: 200 },
      },
    ];
    const aggregate = aggregateResults(scenarioResults);
    assert.equal(aggregate.mean_pass_rate, 1);
  });
});

describe("toCompareRunsFormat", () => {
  it("wraps benchmark.json scenarios into the {runs:[...]} shape compare-runs.mjs expects", () => {
    const benchmark = {
      scenarios: [
        { id: "a", grade: { pass_rate: 0.8 }, timing: { tokens: 500, duration_ms: 1000 } },
        { id: "b", grade: null, timing: { tokens: 300, duration_ms: 900 } },
      ],
    };
    const wrapped = toCompareRunsFormat(benchmark);
    assert.equal(wrapped.runs.length, 2);
    assert.equal(wrapped.runs[0].eval_id, "a");
    assert.equal(wrapped.runs[0].result.pass_rate, 0.8);
    assert.equal(wrapped.runs[0].result.tokens, 500);
    assert.equal(wrapped.runs[1].result.pass_rate, 0);
  });
});

describe("CLI", () => {
  it("exits 3 with usage message when --scenarios is missing", () => {
    assert.throws(
      () => {
        execFileSync(process.execPath, [CLI_PATH, "--skill=foo.md", "--model=x", "--out=out"], { stdio: "pipe" });
      },
      (err) => {
        assert.equal(err.status, 3);
        assert.ok(err.stderr.toString().includes("Usage:"));
        return true;
      },
    );
  });

  it("exits 3 with usage message when required flags are missing outside dry-run", () => {
    const dir = tempDir("benchmark-cli-usage-");
    try {
      assert.throws(
        () => {
          execFileSync(process.execPath, [CLI_PATH, `--scenarios=${dir}`], { stdio: "pipe" });
        },
        (err) => {
          assert.equal(err.status, 3);
          assert.ok(err.stderr.toString().includes("Usage:"));
          return true;
        },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dry-run exits 0 and reports the count for valid scenarios", () => {
    const dir = tempDir("benchmark-cli-dryrun-valid-");
    try {
      writeScenario(dir, "one.json", {
        id: "one",
        prompt: "fix it",
        fixtures: { files: { "src/a.js": "inline:const a = 1;\n" } },
      });
      const stdout = execFileSync(process.execPath, [CLI_PATH, `--scenarios=${dir}`, "--dry-run"], {
        encoding: "utf-8",
      });
      const report = JSON.parse(stdout);
      assert.equal(report.count, 1);
      assert.equal(report.invalid, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dry-run exits 1 when a scenario is invalid", () => {
    const dir = tempDir("benchmark-cli-dryrun-invalid-");
    try {
      writeScenario(dir, "bad.json", { prompt: "missing id" });
      assert.throws(
        () => {
          execFileSync(process.execPath, [CLI_PATH, `--scenarios=${dir}`, "--dry-run"], { stdio: "pipe" });
        },
        (err) => {
          assert.equal(err.status, 1);
          return true;
        },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
