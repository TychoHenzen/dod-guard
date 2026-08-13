// Fixture trees for the check-skill-hygiene tests. `goodTree` passes every
// rule, so a case that breaks one thing shows exactly which rule caught it.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function write(root, rel, text) {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

const SKILLS = {
  "dod-guard/interview": "# Interview\n\nRun `openspec instructions dod --change <id>` and follow it.\n",
  "dod-guard/step-by-step": "# Step by step\n\nThe plan lives at `openspec/changes/<id>/steps.json`.\n",
  "dod-guard/cheap-step": "# Cheap step\n\nA delta over step-by-step.\n",
  "dod-guard/ratchet":
    "# Ratchet\n\nTake a change id. Finish with `dod-guard cover <change-id>`, then `openspec archive <change-id> --yes`.\n",
  "dod-guard/adversarial-workflow":
    "# Adversarial\n\nTake a change id. Close on `dod-guard cover <change-id>` then `openspec archive <change-id> --yes`.\n",
  "dod-guard/blind-rewrite": "# Blind rewrite\n\nWrite the contract under openspec/changes/<id>/specs/.\n",
  "dod-guard/tighten": "# Tighten\n\nOpen a change id for each target.\n",
  "quality-guard/quality-refactor": "# Quality refactor\n\nOpen a change and set `skip_specs: true`.\n",
};

/** A tree every rule passes. Each test case breaks exactly one thing. */
export function goodTree() {
  const root = mkdtempSync(join(tmpdir(), "skill-hygiene-"));
  for (const [path, text] of Object.entries(SKILLS)) {
    const [pkg, name] = path.split("/");
    write(root, `packages/${pkg}/skills/${name}/SKILL.md`, text);
  }
  write(root, "CLAUDE.md", "# Root\n\nThe plan lives in the change directory.\n");
  return root;
}
