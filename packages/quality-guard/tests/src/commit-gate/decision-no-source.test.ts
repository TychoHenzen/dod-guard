import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { decideQuality } from "../../../src/commit-gate/decision-core.js";

test("documentation-only changes need no source decision", () => {
  const result = decideQuality({
    snapshot: {
      baseIdentity: "base",
      targetIdentity: "index",
      changes: [
        {
          kind: "modify",
          before: { path: "README.md", content: "before" },
          after: { path: "README.md", content: "after" },
        },
      ],
    },
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: { findings: [] },
  });
  assert.equal(result.verdict, "PASS");
  assert.match(
    result.input.reason ?? "",
    /No source quality decision was required/,
  );
  assert.equal(result.findings.length, 0);
});
