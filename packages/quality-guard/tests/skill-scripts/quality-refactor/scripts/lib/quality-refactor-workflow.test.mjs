import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const skillPath = fileURLToPath(
  new URL("../../../../../skills/quality-refactor/SKILL.md", import.meta.url),
);
const skill = await readFile(skillPath, "utf8");

test("quality-refactor documents defaults, evidence, recovery, and stops", () => {
  for (const heading of [
    "## Defaults and evidence",
    "## Recovery and stops",
  ]) {
    assert.match(skill, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const signal of [
    /repository root/,
    /default` profile/,
    /--format=units/,
    /\.quality\/units\.json/,
    /REVIEW_REQUIRED/,
    /fingerprint-bound architecture acknowledgement/,
    /arbitrary\s+elapsed-time kill/,
  ]) {
    assert.match(skill, signal);
  }
});
