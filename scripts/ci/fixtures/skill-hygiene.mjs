// Fixture trees for the check-skill-hygiene tests. `goodTree` passes every
// rule, so a case that breaks one thing shows exactly which rule caught it.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const DOD_INSTRUCTION = `      Build the DoD with dod_generate, then amend it.

      Predicate types: exit_code, exit_code_not, output_contains,
      output_not_contains, output_matches, output_not_matches, tdd,
      adversarial, holdout, convergence.

      Categories: behavioral, wiring, test_audit, other.
`;

export function write(root, rel, text) {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

export function schema({ dodInstruction = DOD_INSTRUCTION, stepsRequires = "tasks" } = {}) {
  return `name: dod-guard-spec-driven
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    instruction: Write the proposal.
    requires: []
  - id: dod
    generates: dod.md
    instruction: |
${dodInstruction}
    requires:
      - specs
  - id: steps
    generates: steps.json
    instruction: Run dod-guard steps.
    requires:
      - ${stepsRequires}
apply:
  requires:
    - tasks
`;
}

const SKILLS = {
  "dod-guard/interview": "# Interview\n\nRun `openspec instructions dod --change <id>` and follow it.\n",
  "dod-guard/step-by-step": "# Step by step\n\nThe plan lives at `openspec/changes/<id>/steps.json`.\n",
  "dod-guard/cheap-step": "# Cheap step\n\nA delta over step-by-step.\n",
  "dod-guard/ratchet":
    "# Ratchet\n\nTake a change id. Finish with `dod-guard trace <change-id>`, then `openspec archive <change-id> --yes`.\n",
  "dod-guard/adversarial-workflow":
    "# Adversarial\n\nTake a change id. Close on `dod-guard trace <change-id>` then `openspec archive <change-id> --yes`.\n",
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
  write(root, "openspec/schemas/dod-guard-spec-driven/schema.yaml", schema());
  write(root, "CLAUDE.md", "# Root\n\nThe plan lives in the change directory.\n");
  return root;
}
