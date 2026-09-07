import assert from "node:assert/strict";
import { it } from "node:test";
import {
  classifyProjectPath,
  matchesDiscoveryFilters,
} from "../../../discovery/classification.js";

it(
  "applies path, language, kind, content, and generated " +
    "filters before ranking",
  () => {
    const production = classifyProjectPath("src/helper.ts");
    assert.equal(
      matchesDiscoveryFilters(
        "src/helper.ts",
        production,
        {
          path_globs: ["src/**"],
          languages: ["typescript"],
          kinds: ["function"],
        },
        { language: "typescript", kind: "function" },
      ),
      true,
    );
    assert.equal(
      matchesDiscoveryFilters(
        "src/helper.ts",
        production,
        { kinds: ["class"] },
        { kind: "function" },
      ),
      false,
    );
    assert.equal(
      matchesDiscoveryFilters(
        "target/helper.ts",
        classifyProjectPath("target/helper.ts"),
        {},
        {},
      ),
      false,
    );
  },
);
it(
  "keeps unknown only in the default search and excludes " +
    "it from test and production-only filters",
  () => {
    const unknown = classifyProjectPath("tools/helper.ts");
    assert.deepEqual(unknown, { content: "unknown", source: "unknown" });
    assert.equal(
      matchesDiscoveryFilters("tools/helper.ts", unknown, {}, {}),
      true,
    );
    assert.equal(
      matchesDiscoveryFilters(
        "tools/helper.ts",
        unknown,
        { content: "production" },
        {},
      ),
      false,
    );
    assert.equal(
      matchesDiscoveryFilters(
        "tools/helper.ts",
        unknown,
        { content: "tests" },
        {},
      ),
      false,
    );
  },
);
