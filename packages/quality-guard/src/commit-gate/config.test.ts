import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, parseQualityConfig } from "./config.js";

test("uses conservative architecture policy defaults", () => {
  const config = parseQualityConfig("{}");
  assert.equal(config.directTypeLimit, 12);
  assert.deepEqual(config.genericBuckets, ["utils", "common", "helpers", "shared", "misc"]);
  assert.equal(config.history.maxFirstParentCommits, 200);
  assert.deepEqual(config.pathGroups, {});
});

// covers: quality-guard/architecture-analysis :: Placement analysis detects flat and generic accumulation :: Type is placed in a domain directory
test("accepts named path groups and placement-related policy", () => {
  const config = parseQualityConfig(
    JSON.stringify({
      pathGroups: { policy: ["src/policy/**"], infrastructure: ["src/drivers/**"] },
      directTypeLimit: 7,
      genericBuckets: ["misc"],
      generatedPaths: ["generated/**"],
      testPaths: ["test/**"],
      history: { maxFirstParentCommits: 25 },
    }),
  );
  assert.equal(config.pathGroups.policy?.[0], "src/policy/**");
  assert.equal(config.directTypeLimit, 7);
  assert.equal(config.history.maxFirstParentCommits, 25);
});

// covers: quality-guard/architecture-analysis :: Dependency boundaries are enforceable :: Policy imports a forbidden driver
test("validates explicit dependency directions against configured groups", () => {
  const config = parseQualityConfig(
    JSON.stringify({
      pathGroups: { policy: ["src/policy/**"], infrastructure: ["src/drivers/**"] },
      dependencyDirections: [{ from: "policy", to: "infrastructure", allowed: false }],
    }),
  );
  assert.deepEqual(config.dependencyDirections, [{ from: "policy", to: "infrastructure", allowed: false }]);
});

test("rejects unknown keys, invalid values, and unknown group references", () => {
  for (const source of [
    '{"unexpected": true}',
    '{"directTypeLimit": 0}',
    '{"pathGroups": {"policy": []}}',
    '{"pathGroups": {"policy": ["src"]}, "dependencyDirections": [{"from":"policy","to":"missing","allowed":false}]}',
    '{"pathGroups": {"policy": ["src", "src"]}}',
    '{"history": {"limit": 2}}',
  ]) {
    assert.throws(() => parseQualityConfig(source), ConfigError, source);
  }
});
