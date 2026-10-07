// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { ruleScope } from "./rule-scope.mjs";

// quality-guard owns its rule list, so a rule it adds fails here until someone
// decides whether it judges whole files or single lines.
test("every quality-guard rule has an explicit review scope", async () => {
  const { ALL_RULES } = await import(
    "../../../../../../packages/quality-guard/skills/quality-refactor/scripts/lib/config.mjs"
  );
  assert.deepEqual(
    ALL_RULES.filter((rule) => ruleScope(rule) === undefined),
    [],
  );
  assert.equal(ruleScope("line-length"), "line");
  assert.equal(ruleScope("complexity"), "file");
  assert.equal(ruleScope("a-rule-added-later"), undefined);
});
