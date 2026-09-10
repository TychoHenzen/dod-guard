import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { parseQualityConfig } from "./config.js";
import { decideQuality } from "./decision-core.js";
import { before } from "./refactor-progress-map-fixtures.test.js";
import {
  evaluateResponsibilityMap,
  parseResponsibilityMap,
} from "./responsibility-map.js";

test("recognizes when the declared ownership outcome is achieved", () => {
  const after: ArchitectureFileFact[] = [
    {
      path: "src/runner.ts",
      imports: [],
      references: [],
      types: [
        {
          name: "Runner",
          members: [{ name: "run", kind: "method", visibility: "private" }],
          dependencies: [],
          forwardingPaths: [],
        },
      ],
    },
  ];
  const map = parseResponsibilityMap(
    '{"targetScope":["src/service.ts","src/runner.ts"],"responsibilities":' +
      '[{"name":"run","currentOwners":["Service"],"consumers":[],' +
      '"dependencies":[]}],"desired":{"ownership":[{"responsibility":' +
      '"run","owner":"Runner"}],"boundaries":[]}}',
  );
  const progress = evaluateResponsibilityMap(map, {
    before,
    after,
    config: parseQualityConfig("{}"),
  });
  const result = decideQuality({
    snapshot: {
      baseIdentity: "base",
      targetIdentity: "index",
      changes: [
        {
          kind: "modify",
          before: { path: "src/service.ts", content: "before" },
          after: { path: "src/runner.ts", content: "after" },
        },
      ],
    },
    config: parseQualityConfig("{}"),
    beforeFiles: before,
    afterFiles: after,
    scanner: { findings: [] },
    refactorMap: map,
  });
  assert.equal(progress.hasDeclaredOutcomeProgress, true);
  assert.equal(progress.indicators.ownership.status, "improved");
  assert.equal(result.verdict, "PASS");
});
