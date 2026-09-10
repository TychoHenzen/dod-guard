import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig, severityFor } from "./config.mjs";

test("severityFor respects warn and error bounds", () => {
  const config = buildConfig("default");
  assert.equal(severityFor(config, "complexity", 5), null);
  assert.equal(severityFor(config, "complexity", 6), "warn");
  assert.equal(severityFor(config, "complexity", 10), "warn");
  assert.equal(severityFor(config, "complexity", 11), "error");
});

test("severityFor handles null and missing thresholds", () => {
  const config = buildConfig("default");
  assert.equal(severityFor(config, "types-per-file", 1), null);
  assert.equal(severityFor(config, "types-per-file", 2), "error");
  assert.equal(severityFor(config, "else-branch", 1), null);
});

test(
  "default profile keeps thresholds and presence severities distinct",
  () => {
  const config = buildConfig("default");
  assert.deepEqual(config.thresholds.complexity, { warn: 5, error: 10 });
  assert.equal(config.presence["dead-export"], "error");
  assert.equal(config.presence["else-branch"], "warn");
  assert.equal(config.presence["test-only-export"], "warn");
});

test(
  "strict profile collapses warn bounds and escalates presence rules",
  () => {
  const config = buildConfig("strict");
  assert.deepEqual(config.thresholds.complexity, { warn: null, error: 5 });
  assert.deepEqual(config.thresholds["param-count"], { warn: null, error: 3 });
  assert.deepEqual(config.thresholds["types-per-file"], {
    warn: null,
    error: 1,
  });
  assert.equal(config.presence["assumption-marker"], "error");
  assert.equal(config.presence["todo-marker"], "error");
});
