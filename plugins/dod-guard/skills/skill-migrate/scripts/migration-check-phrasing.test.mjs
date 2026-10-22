import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doc, runJson, useFixtures } from "./harness/migration-check-harness.mjs";

describe("migration-check: phrasing", () => {
  const fx = useFixtures();

  it("catches implicit scope instructions", () => {
    const path = fx.write(
      "implicit.md",
      doc({
        name: "implicit",
        description: "Processes files in batch.",
        body: [
          "# Implicit Scope",
          "",
          "Apply the formatting to the document.",
          "Process the output for errors.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const is = checks.find((c) => c.id === "no-implicit-scope");
    assert.equal(is.pass, false);
    assert.ok(is.hits.length >= 2);
  });

  it("catches drip-fed cross-phase references", () => {
    const path = fx.write(
      "dripfed.md",
      doc({
        name: "drip-fed",
        description: "Multi-phase skill for testing.",
        body: [
          "# Drip Fed",
          "",
          "## Phase 1",
          "",
          "Collect data.",
          "",
          "## Phase 2",
          "",
          "As described in Phase 1, process the data.",
          "See step 1 above for details.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const df = checks.find((c) => c.id === "no-drip-fed");
    assert.equal(df.pass, false);
    assert.ok(df.hits.length >= 1);
  });

  it("catches time-sensitive references", () => {
    const path = fx.write(
      "dated.md",
      doc({
        name: "dated",
        description: "Calls the service API.",
        body: [
          "# Dated",
          "",
          "Before August 2025, use the v1 endpoint.",
          "Since 2024, the API returns JSON.",
          "Scope: one file.",
        ],
      }),
    );
    const { checks } = runJson(path);
    const ts = checks.find((c) => c.id === "no-time-sensitive");
    assert.equal(ts.pass, false);
    assert.ok(ts.hits.length >= 2, `Expected 2+ hits, got ${ts.hits.length}`);
  });
});
