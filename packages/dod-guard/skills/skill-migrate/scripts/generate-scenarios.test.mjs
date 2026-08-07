import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateScenarios } from "./generate-scenarios.mjs";

const SOURCE_A = `function computeSum(a, b) {
  let total = 0;
  for (let i = 0; i < a; i++) {
    total = total + i;
  }
  return total === b;
}
`;

const SOURCE_B = `function computeProduct(x, y) {
  return x * y;
}

function computeDifference(x, y) {
  return x - y;
}
`;

function makeCorpus() {
  const corpusDir = mkdtempSync(join(tmpdir(), "generate-scenarios-corpus-"));
  const repoDir = join(corpusDir, "acme", "widgets");
  mkdirSync(repoDir, { recursive: true });
  writeFileSync(join(repoDir, "sum.js"), SOURCE_A);
  writeFileSync(
    join(repoDir, "sum.js.meta.json"),
    JSON.stringify({ repo: "acme/widgets" }, null, 2),
  );
  writeFileSync(join(repoDir, "product.js"), SOURCE_B);
  writeFileSync(
    join(repoDir, "product.js.meta.json"),
    JSON.stringify({ repo: "acme/widgets" }, null, 2),
  );
  return corpusDir;
}

describe("generateScenarios", () => {
  it("writes one scenario JSON per corpus file by default", () => {
    const corpusDir = makeCorpus();
    const outDir = mkdtempSync(join(tmpdir(), "generate-scenarios-out-"));
    try {
      const written = generateScenarios({ corpusDir, outDir, seed: 42 });
      assert.equal(written.length, 2);

      const outFiles = readdirSync(outDir).filter((f) => f.endsWith(".json"));
      assert.equal(outFiles.length, 2);
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("emits required fields and oracle fixtures with mutated content", () => {
    const corpusDir = makeCorpus();
    const outDir = mkdtempSync(join(tmpdir(), "generate-scenarios-out-"));
    try {
      generateScenarios({ corpusDir, outDir, seed: 7, mutationsPerFile: 1 });
      const outFiles = readdirSync(outDir).filter((f) => f.endsWith(".json"));

      for (const file of outFiles) {
        const scenario = JSON.parse(readFileSync(join(outDir, file), "utf-8"));

        assert.ok(scenario.id, "scenario must have an id");
        assert.ok(scenario.prompt, "scenario must have a prompt");
        assert.ok(scenario.fixtures && scenario.fixtures.files, "scenario must have fixtures.files");

        const fixturePaths = Object.keys(scenario.fixtures.files);
        const srcPaths = fixturePaths.filter((p) => p.startsWith("src/"));
        const oracleSrcPaths = fixturePaths.filter((p) => p.startsWith("oracle/") && !p.endsWith(".mutations.json"));
        const oracleMutationPaths = fixturePaths.filter((p) => p.endsWith(".mutations.json"));

        assert.ok(srcPaths.length > 0, "must include at least one src/ fixture");
        assert.ok(oracleSrcPaths.length > 0, "must include at least one oracle/ source fixture");
        assert.ok(oracleMutationPaths.length > 0, "must include an oracle mutations.json fixture");

        for (const srcPath of srcPaths) {
          const name = srcPath.slice("src/".length);
          const mutatedContent = scenario.fixtures.files[srcPath].slice("inline:".length);
          const originalContent = scenario.fixtures.files[`oracle/${name}`].slice("inline:".length);
          assert.notEqual(mutatedContent, originalContent, `${name} mutated content should differ from original`);
        }
      }
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("expands the prompt template with the file name", () => {
    const corpusDir = makeCorpus();
    const outDir = mkdtempSync(join(tmpdir(), "generate-scenarios-out-"));
    try {
      generateScenarios({
        corpusDir,
        outDir,
        seed: 1,
        promptTemplate: "Fix bugs in {file} now.",
      });
      const outFiles = readdirSync(outDir).filter((f) => f.endsWith(".json"));
      for (const file of outFiles) {
        const scenario = JSON.parse(readFileSync(join(outDir, file), "utf-8"));
        assert.match(scenario.prompt, /Fix bugs in .+ now\./);
        assert.ok(!scenario.prompt.includes("{file}"));
      }
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("groups files per --scenario-size into a single scenario", () => {
    const corpusDir = makeCorpus();
    const outDir = mkdtempSync(join(tmpdir(), "generate-scenarios-out-"));
    try {
      const written = generateScenarios({ corpusDir, outDir, seed: 1, scenarioSize: 2 });
      assert.equal(written.length, 1);

      const scenario = JSON.parse(readFileSync(written[0], "utf-8"));
      const srcPaths = Object.keys(scenario.fixtures.files).filter((p) => p.startsWith("src/"));
      assert.equal(srcPaths.length, 2, "grouped scenario should include both source files");
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
