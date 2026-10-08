import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_RULES,
  buildConfig,
  severityFor,
} from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { parseArgs } from "../../../../../skills/quality-refactor/scripts/quality-scan-options.mjs";

test("severityFor respects medium and high bounds", () => {
  const config = buildConfig();
  assert.equal(severityFor(config, "complexity", 5), null);
  assert.equal(severityFor(config, "complexity", 6), "medium");
  assert.equal(severityFor(config, "complexity", 10), "medium");
  assert.equal(severityFor(config, "complexity", 11), "high");
});

test("severityFor handles null and missing thresholds", () => {
  const config = buildConfig();
  assert.equal(severityFor(config, "types-per-file", 1), null);
  assert.equal(severityFor(config, "types-per-file", 2), "high");
  assert.equal(severityFor(config, "else-branch", 1), null);
});

test("config keeps normalized thresholds and presence severities", () => {
  const config = buildConfig();
  assert.deepEqual(config.thresholds["file-length"], {
    medium: 100,
    high: 300,
  });
  assert.deepEqual(config.thresholds["types-per-file"], {
    medium: null,
    high: 1,
  });
  assert.deepEqual(config.thresholds.complexity, { medium: 5, high: 10 });
  assert.equal(config.presence["dead-export"], "high");
  assert.equal(config.presence["else-branch"], "medium");
  assert.equal(config.presence["test-only-export"], "medium");
  assert.equal(ALL_RULES.includes("assumption-marker"), false);
  assert.equal("assumption-marker" in config.presence, false);
});

test("the scanner CLI rejects the removed --profile option", () => {
  assert.deepEqual(parseArgs(["--profile=strict"]), {
    error: "unknown option: --profile",
  });
});
