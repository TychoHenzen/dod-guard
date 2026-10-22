import assert from "node:assert/strict";
import { test } from "node:test";
import { shadowingRanges } from "#quality-guard-reachability-shadows";

const RANGE = { start: 0, end: 9 };

// Drives the exported entry point because boundName is module-private.
function bindsTarget(param, lang = "ts") {
  const scan = { functions: [{ params: [param], headerStart: 0, end: 9 }] };
  return shadowingRanges(scan, lang, "target").length === 1;
}

test("a plain parameter name binds", () => {
  assert.equal(bindsTarget("target"), true);
});

test("a typed parameter binds its name, not its type", () => {
  assert.equal(bindsTarget("target: number"), true);
  assert.equal(bindsTarget("count: target"), false);
});

test("a defaulted parameter binds its name, not its default", () => {
  assert.equal(bindsTarget("target = 1"), true);
  assert.equal(bindsTarget("count = target"), false);
});

test("a Go parameter binds the first name, not its type", () => {
  assert.equal(bindsTarget("target int", "go"), true);
  assert.equal(bindsTarget("count target", "go"), false);
});

test("a Rust mut parameter binds the name after mut", () => {
  assert.equal(bindsTarget("mut target: u32", "rs"), true);
});

test("a path type does not bind its segments", () => {
  assert.equal(bindsTarget("target: std::fmt::Display", "rs"), true);
  assert.equal(bindsTarget("value: target::Kind", "rs"), false);
});

test("a rest parameter binds its name", () => {
  assert.equal(bindsTarget("...target"), true);
});

test("a destructured parameter binds nothing", () => {
  assert.equal(bindsTarget("{ target }"), false);
  assert.equal(bindsTarget("[target]"), false);
});

test("a shadowing function reports its header-to-end range", () => {
  const scan = { functions: [{ params: ["target"], headerStart: 0, end: 9 }] };
  assert.deepEqual(shadowingRanges(scan, "ts", "target"), [RANGE]);
});
