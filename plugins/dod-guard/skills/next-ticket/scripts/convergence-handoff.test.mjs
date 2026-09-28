import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderConvergence } from "./structured-workflow-proof.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [standard, submit, readme, usage] = await Promise.all([
  read("../../../standards/project-workflow.md"),
  read("../../submit-draft-pr/SKILL.md"),
  read("../../../README.md"),
  read("../../../USAGE.md"),
]);

const OLD_MAPPING_LINES = [
  /- Outcome: verified/,
  /- Requirements and clarifications: verified/,
  /- Plan and tasks: (?:each )?mapped/,
  /- Acceptance and verification: (?:each )?mapped/,
];

test("the draft PR links the handoff comment instead of restating its mapping", () => {
  for (const document of [standard, submit]) {
    assert.match(document, /- Handoff: <link to the ## Implementation handoff comment> \(head <sha>\)/);
    for (const line of OLD_MAPPING_LINES) assert.doesNotMatch(document, line);
  }
  assert.match(readme, /links it from `## Convergence` instead of restating it/);
  assert.match(usage, /links it\s+from `## Convergence` instead of copying the mapping/);
});

test("a verified convergence cannot render without its handoff", () => {
  assert.throws(() => renderConvergence({ outcome: "verified", remainder: [] }), /handoff URL and head SHA/);
});
