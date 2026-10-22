import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doc, runJson, useFixtures } from "./harness/migration-check-harness.mjs";

describe("migration-check: contradictions", () => {
  const fx = useFixtures();

  it("does not treat a prohibition as contradicting itself", () => {
    const path = fx.write(
      "selfneg.md",
      doc({
        name: "self-neg",
        description: "Rewrites files from a contract.",
        body: ["# Self Negative", "", "The tool must not delete files. Use the trash instead.", "Scope: one file."],
      }),
    );
    const { checks } = runJson(path);
    const nc = checks.find((c) => c.id === "no-contradictions");
    assert.equal(nc.pass, true, `Self-contradiction false positive: ${nc.detail}`);
  });

  it("catches a real must/must-not contradiction", () => {
    const path = fx.write(
      "contra.md",
      doc({
        name: "contra",
        description: "Validates build output.",
        body: [
          "# Contradiction",
          "",
          "Always validate the output.",
          "",
          "## Later",
          "",
          "Never validate the output. Use spot checks instead.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const nc = checks.find((c) => c.id === "no-contradictions");
    assert.equal(nc.pass, false, `Expected contradiction detected: ${nc.detail}`);
    assert.ok(nc.value >= 1);
  });
});
