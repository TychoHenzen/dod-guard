Survey this repository for clean-house: duplicate and obsolete implementations
whose dead side can be deleted. Scope: `$INPUTS.scope` if it is set, otherwise
the whole repository.

Read `$PACK_DIR/skills/clean-house/SKILL.md`. Follow its opening rules,
"Tooling", "Stage 1: candidate pairs", "Stage 2: dating" and "Stage 3: prove
removal safe". This workflow does the rest: a maintainer approves on a form,
later sessions port and delete, and scripts run the checks. So:

- Change nothing. Do not edit, delete, port, commit, or run a package manager.
  The one file you write is `$ARTIFACTS_DIR/candidates.json`.
- Ask no one anything. The form is the approval.
- The code-review-graph tools are not available here. Git and `rg` are the
  floor.

Write `$ARTIFACTS_DIR/candidates.json` as one JSON object:

```json
{
  "checks": "npm test && npm run lint",
  "items": [
    {
      "id": "c1",
      "label": "shipping rate v1",
      "confidence": "Strong",
      "gap": "",
      "delete": ["src/rates-v1.ts", "test/rates-v1.test.ts"],
      "keep": ["src/rates.ts"],
      "edits": ["src/index.ts"],
      "dependencies": [],
      "ports": ["1a2b3c4 rounds half-cents up"],
      "created": "2025-02-01 vs 2025-06-12",
      "references": 1,
      "evidence": "Only src/index.ts imports rates-v1; rates.ts is tested; one author wrote both."
    }
  ],
  "weak": ["src/util/format.ts vs src/format.ts: names match, no other signal"],
  "notes": "The -v1 name pattern matched 40% of files, so it measures naming convention and was dropped."
}
```

- `checks`: one shell command, run from the repository root, that builds,
  runs the full test suite and lints. Empty when the repository has none.
- `delete`: every file that goes: the dying side, and the tests, fixtures,
  mocks and data that cover only it. Repository-relative paths with forward
  slashes, tracked files only.
- `keep`: the file or files that supersede it.
- `edits`: every file whose live reference to the dying side gets updated to
  the newer side. A reference that nothing can replace blocks the pair, and a
  blocked pair is not an item.
- `dependencies`: packages whose only consumer is the dying side.
- `ports`: one entry per commit the older side took after the newer side
  existed that fixes shared behavior: `<hash> <what it fixes>`. Changes
  specific to the dying interface are not ports.
- Only a Strong pair, or a Fair pair whose `gap` names the missing evidence in
  one sentence, is an item. Every Weak pair goes in `weak`, one line each.
- A pair whose replacement has no tests is not an item. Say so in `notes`.
