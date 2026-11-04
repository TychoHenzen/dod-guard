import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REVIEWERS } from "./lib/reviewer-results.mjs";

const skill = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");

// The planner copies lens names from this line, and the build refuses any
// name REVIEWERS does not hold, so the two must not drift apart.
test("the Plan lenses line names exactly the reviewers the build accepts", () => {
  const line = skill.split("\n").find((entry) => entry.startsWith("- The lenses are "));
  assert.ok(line, "SKILL.md has no lenses line");
  const names = [...line.matchAll(/`(review-pr-[a-z]+)`/g)].map((match) => match[1]);
  assert.deepEqual(names, [...REVIEWERS]);
  assert.equal(line.includes("dod-guard:review-pr"), false, "lens names carry no dod-guard: prefix");
});
