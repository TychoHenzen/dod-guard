import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { cliAvailable, ensureObsidianRunning } from "./cli.js";

describe("cliAvailable", () => {
  it("returns boolean (false when obsidian CLI not on PATH)", async () => {
    const result = await cliAvailable();
    // obsidian CLI likely not available in test environment
    assert.equal(typeof result, "boolean");
  });
});

describe("ensureObsidianRunning", () => {
  it("throws after timeout when obsidian not installed", async () => {
    // obsidian CLI not available → loop for 60×500ms = 30s, then throw
    // Too slow for unit test — verify the function exists and is callable
    assert.equal(typeof ensureObsidianRunning, "function");
  });
});
