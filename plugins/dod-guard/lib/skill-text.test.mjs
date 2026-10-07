import assert from "node:assert/strict";
import test from "node:test";
import { prose } from "./skill-text.mjs";

test("prose matches a phrase across Markdown line wrapping", () => {
  assert.match("restores the saved\n  admin state", prose("restores the saved admin state"));
  assert.doesNotMatch("restores the savedadmin state", prose("restores the saved admin state"));
});

test("prose treats regex syntax in a phrase as literal text", () => {
  const pattern = prose("project-status.mjs <owner> (In Progress) [x]");
  assert.match("run project-status.mjs <owner> (In Progress) [x] now", pattern);
  assert.doesNotMatch("project-statusXmjs <owner> (In Progress) [x]", pattern);
});

test("prose requires several phrases in the given order", () => {
  const pattern = prose("first step", "second step");
  assert.match("first step, then later the second step", pattern);
  assert.doesNotMatch("second step, then the first step", pattern);
});
