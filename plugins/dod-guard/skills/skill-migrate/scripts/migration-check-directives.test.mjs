import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doc, runJson, useFixtures } from "./migration-check-harness.mjs";

describe("migration-check: directives", () => {
  const fx = useFixtures();

  it("catches bare negative rules without alternatives", () => {
    const path = fx.write(
      "bareneg.md",
      doc({
        name: "bare-neg",
        description: "Checks code quality.",
        body: [
          "# Bare Negatives",
          "",
          "Never modify files outside the target directory.",
          "Do not add new dependencies.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const bn = checks.find((c) => c.id === "no-bare-negatives");
    assert.equal(bn.pass, false);
    assert.ok(bn.hits.length >= 2);
  });

  it("passes negative rules that have alternatives", () => {
    const path = fx.write(
      "goodneg.md",
      doc({
        name: "good-neg",
        description: "Checks code quality.",
        body: [
          "# Good Negatives",
          "",
          "Never use console.log. Use src/utils/logger.ts instead.",
          "Do not modify files outside the target. Use a temp directory instead.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const bn = checks.find((c) => c.id === "no-bare-negatives");
    assert.equal(bn.pass, true, `False positive: ${bn.detail}`);
  });

  it("catches redundant repeated instructions", () => {
    const path = fx.write(
      "redundant.md",
      doc({
        name: "redundant",
        description: "Processes files in batch mode.",
        body: [
          "# Redundant",
          "",
          "Always validate the output before returning results to the user.",
          "",
          "## Later section",
          "",
          "Always validate the output before returning the results to the user.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const rr = checks.find((c) => c.id === "no-redundant-repetition");
    assert.equal(rr.pass, false, `Expected repeated instruction detected: ${rr.detail}`);
  });
});
