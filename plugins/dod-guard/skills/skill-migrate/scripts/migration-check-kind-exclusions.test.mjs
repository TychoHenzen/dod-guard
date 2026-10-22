import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertExcluded, assertWeightsSum, doc, run, useFixtures, writeInstinct } from "./migration-check-harness.mjs";

describe("migration-check: kind exclusions", () => {
  const fx = useFixtures();

  it("agent kind drops delegation-cap and its weight redistributes to the rest", () => {
    const path = fx.write(
      "agent-file.md",
      doc({ name: "agent-check", description: "Handles a task. Use when asked.", body: ["Scope: one file."] }),
    );
    const out = JSON.parse(run([path, "--kind=agent", "--json"]).stdout);
    assertExcluded(out, ["delegation-cap"], "agent");
    assertWeightsSum(out);
  });

  it("claude-md kind drops frontmatter checks, description-triggers, and delegation-cap", () => {
    const path = fx.write("notes.md", ["# Notes", "", "Some project guidance.", ""]);
    const out = JSON.parse(run([path, "--kind=claude-md", "--json"]).stdout);
    assertExcluded(
      out,
      ["name-format", "description-present", "description-person", "description-triggers", "delegation-cap"],
      "claude-md",
    );
    assertWeightsSum(out);
    assert.equal(typeof out.score, "number");
  });

  it("memory kind drops description-triggers and delegation-cap but keeps other frontmatter checks", () => {
    const path = fx.write(
      "mem.md",
      doc({ name: "mem-check", description: "Tracks preferences.", body: ["Scope: one file."] }),
    );
    const out = JSON.parse(run([path, "--kind=memory", "--json"]).stdout);
    assertExcluded(out, ["description-triggers", "delegation-cap"], "memory");
    for (const id of ["name-format", "description-present", "description-person"]) {
      assert.ok(
        out.checks.find((c) => c.id === id),
        `Expected ${id} to remain in memory checks`,
      );
    }
    assertWeightsSum(out);
  });

  it("an instinct kind run reports none of the memory/skill frontmatter checks", () => {
    const path = writeInstinct(fx, "instinct-good.md");
    const out = JSON.parse(run([path, "--kind=instinct", "--json"]).stdout);
    assertExcluded(
      out,
      [
        "name-format",
        "description-present",
        "description-person",
        "description-triggers",
        "delegation-cap",
        "memory-frontmatter",
        "agent-tools",
      ],
      "instinct",
    );
    const instinctCheck = out.checks.find((c) => c.id === "instinct-frontmatter");
    assert.ok(instinctCheck, "Expected instinct-frontmatter check to run");
    assert.equal(instinctCheck.pass, true, `Expected pass: ${instinctCheck.detail}`);
  });
});
