import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GENERATE_SCENARIOS_PATH = fileURLToPath(new URL("./generate-scenarios.mjs", import.meta.url));
const BENCHMARK_PATH = fileURLToPath(new URL("./benchmark.mjs", import.meta.url));

const ADD_SOURCE = `function add(a, b) {
  return a + b;
}
`;

const GREET_SOURCE = `function greet(name) {
  return "Hello " + name;
}
`;

/**
 * Build a two-file corpus with .meta.json sidecars, the shape mine-github.mjs
 * writes. No network or GitHub call involved.
 */
function makeCorpus() {
  const corpusDir = mkdtempSync(join(tmpdir(), "skill-migrate-integration-corpus-"));
  const repoDir = join(corpusDir, "test", "repo");
  mkdirSync(repoDir, { recursive: true });

  writeFileSync(join(repoDir, "add.js"), ADD_SOURCE);
  writeFileSync(
    join(repoDir, "add.js.meta.json"),
    JSON.stringify({ repo: "test/repo", stars: 100, language: "JavaScript" }, null, 2),
  );

  writeFileSync(join(repoDir, "greet.js"), GREET_SOURCE);
  writeFileSync(
    join(repoDir, "greet.js.meta.json"),
    JSON.stringify({ repo: "test/repo", stars: 100, language: "JavaScript" }, null, 2),
  );

  return corpusDir;
}

describe("skill-migrate benchmark sandbox pipeline", () => {
  it("mines a corpus, generates scenarios, and dry-runs the benchmark", () => {
    const corpusDir = makeCorpus();
    const scenariosDir = mkdtempSync(join(tmpdir(), "skill-migrate-integration-scenarios-"));

    try {
      const generateOut = execFileSync(
        process.execPath,
        [GENERATE_SCENARIOS_PATH, `--corpus=${corpusDir}`, `--out=${scenariosDir}`, "--seed=1"],
        { encoding: "utf-8" },
      );
      const generateSummary = JSON.parse(generateOut);
      assert.equal(generateSummary.scenarios, 2, "one scenario per corpus file");

      const benchmarkOut = execFileSync(
        process.execPath,
        [BENCHMARK_PATH, `--scenarios=${scenariosDir}`, "--dry-run"],
        { encoding: "utf-8" },
      );
      const benchmarkSummary = JSON.parse(benchmarkOut);

      assert.equal(benchmarkSummary.count, 2, "dry-run counts both scenarios");
      assert.equal(benchmarkSummary.invalid, 0, "both scenarios must validate");
      assert.equal(benchmarkSummary.results.length, 2);
      for (const result of benchmarkSummary.results) {
        assert.equal(result.valid, true, `${result.file} should be valid`);
        assert.deepEqual(result.issues, []);
      }
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
      rmSync(scenariosDir, { recursive: true, force: true });
    }
  });

  it("exits 0 on a valid scenario directory and does not touch skill or model flags", () => {
    const corpusDir = makeCorpus();
    const scenariosDir = mkdtempSync(join(tmpdir(), "skill-migrate-integration-scenarios-"));

    try {
      execFileSync(
        process.execPath,
        [GENERATE_SCENARIOS_PATH, `--corpus=${corpusDir}`, `--out=${scenariosDir}`, "--seed=5"],
        { encoding: "utf-8" },
      );

      // --dry-run must succeed without --skill or --model, since it only
      // validates scenario shape and never invokes an eval.
      const result = execFileSync(
        process.execPath,
        [BENCHMARK_PATH, `--scenarios=${scenariosDir}`, "--dry-run"],
        { encoding: "utf-8" },
      );
      assert.doesNotThrow(() => JSON.parse(result));
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
      rmSync(scenariosDir, { recursive: true, force: true });
    }
  });
});
