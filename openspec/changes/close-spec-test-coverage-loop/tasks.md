## 1. Spec-test skill: formalize marker emission and coverage summary

- [x] 1.1 Update the `dod-guard/spec-test` spec to add the two new requirements (marker emission, coverage summary) and the modified requirement (implementation-read scope), matching the delta in `specs/dod-guard/spec-test/spec.md`
<!-- status: completed -->
- [x] 1.2 Verify the SKILL.md already matches the new spec requirements for marker emission (step 4, lines 79-83). If not, update the SKILL.md to match
<!-- status: completed -->
- [x] 1.3 Add the coverage summary to the SKILL.md output format section: total scenarios, covered count, uncovered count, percentage, scoped to the targeted capability or requirement
<!-- status: completed -->

## 2. Baseline cleanup

- [x] 2.1 Run `dod-guard cover --all --write-baseline` to drop the 11 orphaned entries from `dod-guard/generation-from-spec` (7) and `dod-guard/trace-closure` (4)
<!-- status: completed -->
- [x] 2.2 Verify the rewritten baseline has no orphaned entries and the scenario count matches the current spec tree
<!-- status: completed -->

## 3. Wire covers markers to existing dod-guard tests

- [x] 3.1 Audit `packages/dod-guard/src/**/*.test.ts` files (excluding the 5 files that already have markers) and identify which tests exercise a spec scenario
<!-- status: completed -->
- [x] 3.2 Add `// covers:` markers to the identified tests in the dod-guard package
<!-- status: completed -->
- [x] 3.3 Run `dod-guard cover --all` to confirm the newly wired markers are recognized and the bound count increases
<!-- status: completed -->

## 4. Wire covers markers to other packages

- [ ] 4.1 Audit and wire markers in `packages/quality-guard/src/**/*.test.ts`
- [ ] 4.2 Audit and wire markers in `packages/evomcp/src/**/*.test.ts`
- [ ] 4.3 Audit and wire markers in `packages/gitevo/src/**/*.test.ts`
- [ ] 4.4 Audit and wire markers in `packages/obsidian-rag/src/**/*.test.ts`

## 5. Verify

- [ ] 5.1 Run `dod-guard cover --all` and confirm no regressions
- [ ] 5.2 Run `npm test` across all packages to confirm no tests broke
- [ ] 5.3 Run `dod-guard cover --all --write-baseline` to lock the new coverage level into the ratchet
