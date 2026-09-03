## 1. Shared detection module

- [ ] 1.1 Create `scripts/ci/lib/obligation-count.mjs` with `countObligations(bodyText)` and `analyzeSpec(specFilePath)` functions
<!-- covers: dod-guard/spec-hygiene :: A shared module counts obligation keywords in requirement text :: A requirement with five obligations and one scenario -->
<!-- covers: dod-guard/spec-hygiene :: A shared module counts obligation keywords in requirement text :: A requirement with one obligation and three scenarios -->
<!-- covers: dod-guard/spec-hygiene :: A shared module counts obligation keywords in requirement text :: A requirement with no obligation keywords -->
<!-- covers: dod-guard/spec-hygiene :: A shared module counts obligation keywords in requirement text :: Keywords inside scenario blocks are not counted -->
<!-- covers: dod-guard/spec-hygiene :: A shared module counts obligation keywords in requirement text :: Case-insensitive matching -->
<!-- covers: dod-guard/spec-hygiene :: A shared module counts obligation keywords in requirement text :: Word-boundary matching avoids false positives -->

- [ ] 1.2 Write tests for `obligation-count.mjs` covering all six scenarios from the spec

## 2. CI lint script

- [ ] 2.1 Create `scripts/ci/check-spec-hygiene.mjs` that walks `openspec/specs/**/spec.md`, calls `analyzeSpec`, prints warnings for positive deltas, and prints a summary line
<!-- covers: dod-guard/spec-hygiene :: The lint script reports compound requirements as warnings :: A spec tree with compound and clean requirements -->
<!-- covers: dod-guard/spec-hygiene :: The lint script reports compound requirements as warnings :: All requirements are clean -->
<!-- covers: dod-guard/spec-hygiene :: The lint script prints a summary line :: Summary line content -->

- [ ] 2.2 Add `--strict` flag handling: exit 1 when any delta > 0 and `--strict` is passed, exit 0 otherwise
<!-- covers: dod-guard/spec-hygiene :: The lint script exits 0 in warning mode and 1 in strict mode :: Warnings found without --strict -->
<!-- covers: dod-guard/spec-hygiene :: The lint script exits 0 in warning mode and 1 in strict mode :: Warnings found with --strict -->
<!-- covers: dod-guard/spec-hygiene :: The lint script exits 0 in warning mode and 1 in strict mode :: No warnings with --strict -->

- [ ] 2.3 Write tests for `check-spec-hygiene.mjs` using fixture spec trees

- [ ] 2.4 Wire `check-spec-hygiene.mjs` into the `plugin-config` CI job in `.github/workflows/npm-publish.yml`, after `check-skill-hygiene.mjs`
<!-- covers: dod-guard/spec-hygiene :: The lint script runs in CI alongside check-skill-hygiene :: CI runs the spec hygiene check -->

## 3. Dashboard integration

- [ ] 3.1 Extend `parseSpecTitles` in `project-reads.mjs` to capture requirement body text and compute obligation counts via the shared module, returning `obligationCount` on each requirement in `specDetail`
<!-- covers: openspec-dashboard/scenario-coverage :: The spec detail API includes obligation counts per requirement :: Spec detail response includes obligation counts -->

- [ ] 3.2 Add obligation delta chip to `requirementBlock` in `render-spec.mjs`, shown only when delta > 0
<!-- covers: openspec-dashboard/scenario-coverage :: The spec detail view shows an obligation delta per requirement :: A requirement with positive obligation delta -->
<!-- covers: openspec-dashboard/scenario-coverage :: The spec detail view shows an obligation delta per requirement :: A requirement with zero or negative delta -->

- [ ] 3.3 Add CSS for the obligation chip (warning color, consistent with existing chip styles)

## 4. Spec-split skill

- [ ] 4.1 Create skill directory `packages/dod-guard/skills/spec-split/` with `SKILL.md`

- [ ] 4.2 Write the skill script that detects compound requirements, proposes scenarios, and waits for user confirmation before writing
<!-- covers: dod-guard/spec-hygiene :: The spec-split skill walks compound requirements interactively :: A compound requirement with delta 3 -->
<!-- covers: dod-guard/spec-hygiene :: The spec-split skill walks compound requirements interactively :: User rejects a proposed scenario -->

- [ ] 4.3 Add test-binding re-assignment logic that reads the bound test's assertions and matches against sub-scenarios
<!-- covers: dod-guard/spec-hygiene :: The spec-split skill re-assigns test bindings after a split :: A bound compound scenario splits into three -->
<!-- covers: dod-guard/spec-hygiene :: The spec-split skill re-assigns test bindings after a split :: A compound scenario with no bound test splits -->

- [ ] 4.4 Register the skill in `packages/dod-guard/.claude-plugin/marketplace.json` and `plugin.json`
