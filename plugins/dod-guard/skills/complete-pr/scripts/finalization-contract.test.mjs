import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

test("finalizes each structured parent child only after the guarded merge", () => {
  const finalization = skill.slice(skill.indexOf("## Finalize the parent unit"));

  assert.match(finalization, /Only after the helper returns a verified merge result/);
  assert.match(finalization, /exactly one child for implementation; wiring and end-to-end\s+usability; refactoring and quality; and fixing and reliability/);
  assert.match(finalization, /Resolve the\s+shared Project, item, Status-field, and `Done` option IDs once/);
  assert.match(finalization, /gh project item-edit --id <item-id> --project-id <project-id> --field-id\s+<status-field-id> --single-select-option-id <done-option-id>/);
  assert.match(finalization, /Set every\s+mandatory child Project item to `Done`, then set the parent\s+item to `Done`/);
  assert.match(finalization, /after each mutation, read that item back from the shared Project/);
  assert.match(finalization, /Never finalize a parent or child before the helper's merge result/);
  assert.match(finalization, /never alter unrelated Project items/);
});
