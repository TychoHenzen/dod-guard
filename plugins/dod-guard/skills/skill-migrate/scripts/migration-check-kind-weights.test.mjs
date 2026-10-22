import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertExcluded,
  assertWeightsSum,
  doc,
  GOOD_SKILL,
  run,
  useFixtures,
  writeInstinct,
} from "./migration-check-harness.mjs";

describe("migration-check: kind weights", () => {
  const fx = useFixtures();

  it("skill kind runs all 19 checks with weights summing to 100", () => {
    const path = fx.write("good.md", GOOD_SKILL);
    const out = JSON.parse(run([path, "--json"]).stdout);
    assert.equal(out.checks.length, 19);
    assertWeightsSum(out);
  });

  it("a skill-kind run reports neither memory-frontmatter nor agent-tools", () => {
    const path = fx.write("good.md", GOOD_SKILL);
    const out = JSON.parse(run([path, "--json"]).stdout);
    assertExcluded(out, ["memory-frontmatter", "agent-tools"], "skill");
  });

  it("agent and memory kind weights still sum to 100 with their extra check included", () => {
    const agentPath = fx.write(
      "agent-weights.md",
      doc({
        name: "agent-w",
        description: "Does something. Use when asked.",
        extra: ["tools: Read"],
        body: ["Scope: one file."],
      }),
    );
    const agentOut = JSON.parse(run([agentPath, "--kind=agent", "--json"]).stdout);
    assert.ok(agentOut.checks.find((c) => c.id === "agent-tools"));
    assertWeightsSum(agentOut);

    const memoryPath = fx.write(
      "memory-weights.md",
      doc({
        name: "memory-w",
        description: "Tracks preferences.",
        extra: ["metadata:", "  type: reference"],
        body: ["Notes."],
      }),
    );
    const memoryOut = JSON.parse(run([memoryPath, "--kind=memory", "--json"]).stdout);
    assert.ok(memoryOut.checks.find((c) => c.id === "memory-frontmatter"));
    assertWeightsSum(memoryOut);
  });

  it("instinct kind weights sum to 100 with instinct-frontmatter included", () => {
    const path = writeInstinct(fx, "instinct-weights.md");
    const out = JSON.parse(run([path, "--kind=instinct", "--json"]).stdout);
    assert.ok(out.checks.find((c) => c.id === "instinct-frontmatter"));
    assertWeightsSum(out);
  });
});
