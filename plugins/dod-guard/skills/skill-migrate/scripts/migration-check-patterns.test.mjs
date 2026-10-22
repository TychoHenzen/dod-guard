import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BAD_SKILL, doc, runJson, useFixtures } from "./harness/migration-check-harness.mjs";

describe("migration-check: patterns", () => {
  const fx = useFixtures();

  it("catches scaffolding patterns and lowers the score", () => {
    const { code, score, checks } = runJson(fx.write("bad.md", BAD_SKILL));
    assert.equal(code, 1);
    const scaffolding = checks.find((c) => c.id === "no-scaffolding");
    assert.equal(scaffolding.pass, false);
    assert.ok(scaffolding.hits.length >= 3, `Expected 3+ hits, got ${scaffolding.hits.length}`);
    assert.ok(scaffolding.score < 1, "count check should score below 1");
    assert.ok(score < 100, `Expected score below 100, got ${score}`);
  });

  it("skips scaffolding patterns inside code fences", () => {
    const path = fx.write(
      "fenced.md",
      doc({
        name: "fenced-ok",
        description: "Runs scripts that check output. Use when the user asks for a check.",
        body: ["# Fenced", "", "Scope: one file.", "", "```bash", "echo 'double-check your work'", "```"],
      }),
    );
    const { checks } = runJson(path);
    const scaffolding = checks.find((c) => c.id === "no-scaffolding");
    assert.equal(scaffolding.pass, true, `False positive in code fence: ${scaffolding.detail}`);
  });

  it("catches conservative filter patterns", () => {
    const path = fx.write(
      "conservative.md",
      doc({
        name: "conservative",
        description: "Reviews code for issues.",
        body: [
          "# Conservative",
          "",
          "Be conservative when flagging issues.",
          "Only report high-severity problems.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const cf = checks.find((c) => c.id === "no-conservative-filters");
    assert.equal(cf.pass, false);
    assert.ok(cf.hits.length >= 2, `Expected 2+ hits, got ${cf.hits.length}`);
  });

  it("counts caps-emphasis markers", () => {
    const path = fx.write(
      "emphasis.md",
      doc({
        name: "emphasis",
        description: "Formats commit messages.",
        body: [
          "# Emphasis",
          "",
          "IMPORTANT: run the linter.",
          "IMPORTANT: run the tests.",
          "YOU MUST commit after each step.",
          "ALWAYS push at the end.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const em = checks.find((c) => c.id === "emphasis-density");
    assert.equal(em.pass, false);
    assert.equal(em.value, 4);
  });
});
