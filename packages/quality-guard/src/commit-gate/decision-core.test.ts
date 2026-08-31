import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { decideQuality } from "./decision-core.js";

test("passes a documentation-only snapshot without source findings", () => {
  const decision = decideQuality({
    snapshot: {
      baseIdentity: "base",
      targetIdentity: "target",
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

  assert.equal(decision.verdict, "PASS");
  assert.deepEqual(decision.findings, []);
  assert.match(decision.input.reason ?? "", /No source quality decision was required/);
});
