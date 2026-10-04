import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const disposition = await readFile(
  new URL(
    "../../../../../skills/quality-refactor/reference/dispositions.md",
    import.meta.url,
  ),
  "utf8",
);
const skill = await readFile(
  new URL("../../../../../skills/quality-refactor/SKILL.md", import.meta.url),
  "utf8",
);

test("records the null-like argument not-planned boundary", () => {
  const normalizedDisposition = disposition.replace(/\s+/g, " ");
  for (const signal of [
    "Generic Quality Guard remains quiet",
    "resolved call target and overload",
    "nullability or other explicit contract metadata",
    "unsupported fixtures for every supported language",
    "actionable remediation tied to the resolved contract",
    "does not weaken a future explicit contract rule",
    "does not duplicate the separate Chapter 7 disposition for null-like return values",
  ]) {
    assert.ok(
      normalizedDisposition.includes(signal),
      `disposition must contain ${signal}`,
    );
  }
});

test("wires chapter-only dispositions into the quality-refactor skill", () => {
  assert.ok(skill.includes("reference/dispositions.md"));
});
