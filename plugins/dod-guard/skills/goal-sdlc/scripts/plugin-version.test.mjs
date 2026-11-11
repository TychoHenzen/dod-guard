import assert from "node:assert/strict";
import test from "node:test";
import { classifyVersions, refreshCommands } from "./plugin-version.mjs";

const CASES = [
  ["5.4.61", "5.13.4", "stale"],
  ["5.9.0", "5.10.0", "stale"],
  ["5.13.3", "5.13.4", "stale"],
  ["4.99.99", "5.0.0", "stale"],
  ["5.13.4", "5.13.4", "current"],
  ["5.13.5", "5.13.4", "ahead"],
  ["5.14.0", "5.13.4", "ahead"],
  ["6.0.0", "5.99.99", "ahead"],
  ["5.13.4-rc.1", "5.13.4", "unreadable"],
  ["5.13", "5.13.4", "unreadable"],
  ["5.13.4", "v5.13.5", "unreadable"],
  ["", "5.13.4", "unreadable"],
  [null, "5.13.4", "unreadable"],
  ["5.13.4", undefined, "unreadable"],
];

for (const [installed, published, expected] of CASES) {
  test(`classifyVersions(${JSON.stringify(installed)}, ${JSON.stringify(published)}) is ${expected}`, () => {
    assert.equal(classifyVersions(installed, published), expected);
  });
}

test("refreshCommands names the reload step for Claude and the upgrade for Codex", () => {
  assert.deepEqual(refreshCommands("claude"), ["/plugin marketplace update dod-guard", "/reload-plugins"]);
  assert.deepEqual(refreshCommands("codex"), [
    "codex plugin marketplace upgrade dod-guard-monorepo",
    "codex plugin add dod-guard@dod-guard-monorepo",
  ]);
});

test("refreshCommands is empty for a client it does not know", () => {
  assert.deepEqual(refreshCommands("other"), []);
});
