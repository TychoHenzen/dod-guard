// Requirement: none - see Task
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const FORBIDDEN_TOKENS = [
  "dod_tree",
  "dod_refine",
  "dod_status",
  "dod_list",
  "dod_add_node",
  "dod_amend",
  "dod-guard check",
];

const TARGET_FILES = [
  "packages/dod-guard/skills/step-by-step/SKILL.md",
  "packages/dod-guard/skills/opsx-quick/SKILL.md",
  "packages/dod-guard/skills/opsx-propose/SKILL.md",
  "packages/dod-guard/skills/test-integrity-checker/SKILL.md",
];

// covers: dod-guard/change-scoped-skills :: no skill or agent references the removed DoD-tree tools :: A grep for the removed tools finds nothing
test("no skill or agent references the removed DoD-tree tools", () => {
  const hits: string[] = [];
  for (const relPath of TARGET_FILES) {
    const content = readFileSync(`${REPO_ROOT}${relPath}`, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const token of FORBIDDEN_TOKENS) {
        if (lines[i].includes(token)) {
          hits.push(`${relPath}:${i + 1}: ${token}`);
        }
      }
    }
  }
  assert.deepEqual(hits, []);
});
