import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "./evo-config.js";

function rootWith(config?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitevo-config-"));
  if (config === undefined) return dir;
  fs.mkdirSync(path.join(dir, ".evo"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".evo", "config.json"), config);
  return dir;
}

describe("loadConfig", () => {
  // covers: gitevo/safety-gate :: Configuration controls what counts as source, where build output lives, and whether the stale check runs :: No settings file
  it("returns the defaults when no file is present", () => {
    const config = loadConfig(rootWith());
    assert.deepEqual(config.sourceExtensions, [".ts", ".js", ".mjs", ".json", ".md", ".yml", ".yaml"]);
    assert.deepEqual(config.buildLayouts, ["packages/*/dist/", "dist/"]);
    assert.equal(config.skipStaleCheck, false);
  });

  // covers: gitevo/safety-gate :: Configuration controls what counts as source, where build output lives, and whether the stale check runs :: Settings file overrides one key
  it("shallow merges the file over the defaults", () => {
    const config = loadConfig(rootWith(JSON.stringify({ buildLayouts: ["out/"], skipStaleCheck: true })));
    assert.deepEqual(config.buildLayouts, ["out/"]);
    assert.equal(config.skipStaleCheck, true);
    assert.ok(config.sourceExtensions.includes(".ts"));
  });

  // covers: gitevo/safety-gate :: Configuration controls what counts as source, where build output lives, and whether the stale check runs :: Settings file will not parse
  it("falls back to the defaults when the file will not parse", () => {
    const config = loadConfig(rootWith("{ not json"));
    assert.deepEqual(config.buildLayouts, ["packages/*/dist/", "dist/"]);
    assert.equal(config.skipStaleCheck, false);
  });

  it("hands out a fresh copy each call", () => {
    const dir = rootWith();
    loadConfig(dir).sourceExtensions.push(".zig");
    assert.ok(!loadConfig(dir).sourceExtensions.includes(".zig"));
  });
});
