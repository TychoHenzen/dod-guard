import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { ConfigError } from "../../../src/commit-gate/config-error.js";

test("uses conservative architecture policy defaults", () => {
  const config = parseQualityConfig("{}");
  assert.equal(config.directTypeLimit, 12);
  assert.deepEqual(config.genericBuckets, [
    "utils",
    "common",
    "helpers",
    "shared",
    "misc",
  ]);
  assert.equal(config.history.maxFirstParentCommits, 200);
  assert.deepEqual(config.pathGroups, {});
  assert.deepEqual(config.lowLevelPathGroups, []);
  assert.deepEqual(config.fluentMarkers, [
    "builder",
    "fluent",
    "pipeline",
    "query",
  ]);
});

test("accepts named path groups and placement-related policy", () => {
  const config = parseQualityConfig(
    JSON.stringify({
      pathGroups: {
        policy: ["src/policy/**"],
        infrastructure: ["src/drivers/**"],
      },
      directTypeLimit: 7,
      genericBuckets: ["misc"],
      generatedPaths: ["generated/**"],
      testPaths: ["test/**"],
      lowLevelPathGroups: ["infrastructure"],
      fluentMarkers: ["builder"],
      history: { maxFirstParentCommits: 25 },
    }),
  );
  assert.equal(config.pathGroups.policy?.[0], "src/policy/**");
  assert.equal(config.directTypeLimit, 7);
  assert.equal(config.history.maxFirstParentCommits, 25);
  assert.deepEqual(config.lowLevelPathGroups, ["infrastructure"]);
  assert.deepEqual(config.fluentMarkers, ["builder"]);
});

test("validates configured dependency directions", () => {
  const config = parseQualityConfig(
    JSON.stringify({
      pathGroups: {
        policy: ["src/policy/**"],
        infrastructure: ["src/drivers/**"],
      },
      dependencyDirections: [
        { from: "policy", to: "infrastructure", allowed: false },
      ],
    }),
  );
  assert.deepEqual(config.dependencyDirections, [
    { from: "policy", to: "infrastructure", allowed: false },
  ]);
});

test("rejects invalid and unknown config", () => {
  for (const source of [
    '{"unexpected": true}',
    '{"directTypeLimit": 0}',
    '{"pathGroups": {"policy": []}}',
    '{"pathGroups": {"policy": ["src"]}, "dependencyDirections": ' +
      '[{"from":"policy","to":"missing","allowed":false}]}',
    '{"pathGroups": {"policy": ["src", "src"]}}',
    '{"history": {"limit": 2}}',
    '{"pathGroups":{"policy":["src"]},"lowLevelPathGroups":["missing"]}',
  ]) {
    assert.throws(() => parseQualityConfig(source), ConfigError, source);
  }
});

test("rejects inherited path-group names", () => {
  assert.throws(
    () =>
      parseQualityConfig(JSON.stringify({ lowLevelPathGroups: ["toString"] })),
    ConfigError,
  );
});
