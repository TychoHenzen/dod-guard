## 1. Create the spec-extract skill

- [x] 1.1 Create `packages/dod-guard/skills/spec-extract/SKILL.md` with orchestration instructions for target classification, agent dispatch, output-format transform, file write, and OpenSpec merge
- [x] 1.2 Add `.spec-extract/` to the repo `.gitignore` with a comment naming spec-extract as the writer

## 2. Modify blind-rewrite Phase 2

- [x] 2.1 Replace the inline extraction logic in `packages/dod-guard/skills/blind-rewrite/SKILL.md` with a delegation call to `/spec-extract`, keeping the banned-vocabulary screening and the human-review gate in blind-rewrite
- [x] 2.2 Verify that the human-review gate still works with the file-based contract output from spec-extract

## 3. Plugin registration

- [x] 3.1 Add `spec-extract` to `packages/dod-guard/.claude-plugin/plugin.json` skills list and update the skill count
- [x] 3.2 Add `spec-extract` to `packages/dod-guard/.claude-plugin/marketplace.json`
- [x] 3.3 Update the root `.claude-plugin/marketplace.json` skill count
- [x] 3.4 Update `packages/dod-guard/CLAUDE.md` to list `/spec-extract` in the skill table

## 4. Validation

- [x] 4.1 Run `node scripts/ci/validate-plugins.mjs` and confirm the new skill passes manifest agreement, reachability, and description honesty checks
- [x] 4.2 Run `node scripts/ci/check-skill-hygiene.mjs` and confirm spec-extract passes all ten rules
- [x] 4.3 Run `openspec validate --change split-blind-rewrite-extraction --strict` and confirm the change validates
