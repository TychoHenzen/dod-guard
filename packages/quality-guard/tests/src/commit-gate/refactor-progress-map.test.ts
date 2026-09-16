import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { decideQuality } from "../../../src/commit-gate/decision-core.js";
import {
  evaluateResponsibilityMap,
  parseResponsibilityMap,
} from "../../../src/commit-gate/responsibility-map.js";
import { before, mapSource } from "./refactor-progress-map-fixtures.test.js";

test(
  "requires declared ownership progress instead of accepting local metric " +
    "improvements",
  () => {
    const map = parseResponsibilityMap(mapSource);
    const progress = evaluateResponsibilityMap(map, {
      before,
      after: before,
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
            after: { path: "src/service.ts", content: "after" },
          },
        ],
      },
      config: parseQualityConfig("{}"),
      beforeFiles: before,
      afterFiles: before,
      scanner: { findings: [] },
      refactorMap: map,
    });
    assert.equal(progress.hasDeclaredOutcomeProgress, false);
    assert.equal(progress.indicators.ownership.status, "unchanged");
    assert.equal(result.verdict, "REVIEW_REQUIRED");
    assert.ok(
      result.findings.some((finding) =>
        finding.reason.startsWith("refactor-structural-progress:"),
      ),
    );
    assert.deepEqual(result.refactorProgress?.indicators, progress.indicators);
  },
);
