import assert from "node:assert/strict";
import { it } from "node:test";
import {
  classifyProjectPath,
  matchesDiscoveryFilters,
} from "../../../discovery/classification.js";

it(
  "excludes generated content before ranking unless " + "explicitly requested",
  () => {
    const generated = classifyProjectPath("target/helper.ts");
    assert.equal(
      matchesDiscoveryFilters("target/helper.ts", generated, {}, {}),
      false,
    );
  },
);
it("includes generated content when the " + "client requests it", () => {
  const generated = classifyProjectPath("target/helper.ts");
  assert.equal(
    matchesDiscoveryFilters(
      "target/helper.ts",
      generated,
      { include_generated: true },
      {},
    ),
    true,
  );
});
it(
  "excludes test content before ranking when production " +
    "content is requested",
  () => {
    const test = classifyProjectPath("tests/helper.test.ts");
    assert.equal(
      matchesDiscoveryFilters(
        "tests/helper.test.ts",
        test,
        { content: "production" },
        {},
      ),
      false,
    );
  },
);
