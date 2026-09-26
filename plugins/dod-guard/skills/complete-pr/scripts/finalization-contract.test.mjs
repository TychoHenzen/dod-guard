import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const standard = await readFile(new URL("../../../standards/github-request-discipline.md", import.meta.url), "utf8");

test("finalizes each structured parent child only after the guarded merge", () => {
  const finalization = skill.slice(skill.indexOf("## Finalize the parent unit"));

  assert.match(finalization, /Only after the helper returns a verified merge result/);
  assert.match(finalization, /exactly one child for implementation; wiring and end-to-end\s+usability; refactoring and quality; and fixing and reliability/);
  assert.match(finalization, /Resolve the\s+shared Project number, global ProjectV2 node ID, item node IDs, Status-field\s+node ID, and `Done` option ID once/);
  assert.match(finalization, /project-status\.mjs <owner> <project-number> <status-field-node-id> <done-option-id> Done <child-item-id> \.\.\. <parent-item-id>/);
  assert.match(finalization, /child item IDs first and the parent item ID last/);
  assert.match(finalization, /passes that value—not the numeric project number—to `--project-id`/);
  assert.match(finalization, /reads\s+each item back from the shared Project before continuing/);
  assert.match(finalization, /For every code-backed\s+child, verify its pushed commit is\s+included in the verified merge/);
  assert.match(finalization, /Close a\s+still-open code-backed\s+child only after\s+that verification/);
  assert.match(finalization, /Never finalize a parent or child\s+before the helper's merge result/);
  assert.match(finalization, /never\s+alter unrelated Project items/);
});

test("shares the global ProjectV2 resolution and sequential readback contract", () => {
  assert.match(standard, /numeric Project number is valid for list and view commands, but it is not a\s+GraphQL ProjectV2 node ID/);
  assert.match(standard, /top-level `id` value, which must begin with `PVT_`, as `--project-id`/);
  assert.match(standard, /write every child\s+before the parent, then read each item/);
  assert.match(standard, /skills\/complete-pr\/scripts\/project-status\.mjs/);
});
