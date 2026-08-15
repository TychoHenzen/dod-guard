## Context

See proposal.md for motivation. The `/spec-test` SKILL.md already instructs marker emission (step 4, lines 79-83), but the `dod-guard/spec-test` spec has no requirement for it. The SKILL.md is ahead of the spec. This change formalizes what the skill already does and adds the missing coverage summary.

`dod-guard cover` parses `covers:` markers correctly for all supported languages. No changes to the `cover` subsystem are needed.

The coverage-gate baseline has 494 entries, all `unwired`, plus 11 orphaned entries from two deleted capabilities (`dod-guard/generation-from-spec` and `dod-guard/trace-closure`). The 81 existing test files test real behavior but carry no markers.

## Goals / Non-Goals

**Goals:**
- Formalize `covers:` marker emission as a spec requirement so future skill changes cannot silently drop it
- Make the coverage summary report show a denominator and percentage so a reader knows the scale of the gap
- Clean the baseline of orphaned entries
- Wire `covers:` markers into existing test files where a test already exercises a spec scenario, starting with the `dod-guard` package (382 scenarios, 10 currently bound)

**Non-Goals:**
- Achieving 100% marker coverage across all 919 scenarios. The 81 test files cover behavior for their packages but not every scenario. Wiring markers where no matching test exists is `/spec-test`'s job, invoked per-capability, not a batch operation
- Changing `dod-guard cover` itself. The parser, ratchet, and baseline logic are correct
- Automated marker insertion. Each marker requires a human to confirm that the test actually exercises the scenario the marker names

## Decisions

**1. Spec delta modifies `spec-test`, not `coverage-gate`.**

The marker format and parsing are a `coverage-gate` concern and already specified. The act of emitting markers during test generation is a `spec-test` concern. The SKILL.md already does it. The spec needs to catch up.

Alternative: add a cross-reference requirement in `coverage-gate`. Rejected because `coverage-gate` is about scanning and ratcheting, not about how markers get created.

**2. Coverage summary scopes to the targeted spec or requirement, not the whole tree.**

`/spec-test` runs against one capability at a time. Reporting whole-tree coverage (919 scenarios) when the user targeted one capability with 23 scenarios would be noise. The summary shows the denominator for the scope the user asked about.

Alternative: show both scoped and whole-tree. Rejected because the user can run `dod-guard cover --all` for the whole-tree view.

**3. Baseline cleanup via `dod-guard cover --all --write-baseline`, not by hand-editing the JSON.**

The 11 orphaned entries (`generation-from-spec`, `trace-closure`) drop when `--write-baseline` rewrites the map from the current run. This is the intended cleanup path per the coverage-gate spec (scenario "A baselined scenario id is missing from a whole-tree run").

**4. Marker wiring is manual, guided, per-package.**

Each existing test file needs a human to confirm the test exercises the scenario the marker would name. Batch insertion without verification would create false bindings that pass the ratchet but mean nothing. The tasks break this into per-package batches, starting with `dod-guard` where the most scenarios live.

## Risks / Trade-offs

**[Risk] Marker wiring takes longer than expected.** 81 test files, 919 scenarios. Not every test maps to a scenario. Some scenarios have no test at all. Mitigation: start with `dod-guard` (382 scenarios, most existing tests), measure the wiring rate, and adjust scope for other packages.

**[Risk] False bindings.** A marker placed on a test that does not actually exercise the scenario it names passes `dod-guard cover` but gives false confidence. Mitigation: the coverage-gate spec distinguishes `bound` from `covered-and-integrated` for exactly this reason. A future integration check can catch false bindings.
