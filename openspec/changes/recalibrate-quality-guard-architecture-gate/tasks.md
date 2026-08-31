## 1. Staged Decision Inputs

- [x] 1.1 Add tested Git snapshot readers for the local index against `HEAD` and a committed tree against its first parent, including additions, edits, deletions, renames, staged-only content, and no-working-tree mutation.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Analysis compares staged architecture with its base :: Staged file differs from the working tree -->
<!-- covers: quality-guard/architecture-analysis :: Analysis compares staged architecture with its base :: Type moves between directories -->
<!-- covers: quality-guard/commit-gate :: Local and CI execution agree :: Commit bypasses the local hook -->

- [x] 1.2 Add strict `.quality-guard.json` parsing with path groups, dependency directions, direct-type limits, generic buckets, generated paths, test paths, and bounded history defaults. Cover unknown keys and invalid group references with usage-error tests.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Placement analysis detects flat and generic accumulation :: Type is placed in a domain directory -->
<!-- covers: quality-guard/architecture-analysis :: Dependency boundaries are enforceable :: Policy imports a forbidden driver -->

- [x] 1.3 Add stable finding, evidence, snapshot-summary, and decision-result types plus staged fingerprinting that excludes only the tracked architecture decision record. Verify deterministic identifiers and ordering against repeated fixtures.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Every finding is reproducible :: Identical staged snapshot is analyzed twice -->
<!-- covers: quality-guard/architecture-analysis :: Every finding is reproducible :: Required analysis cannot complete -->
<!-- covers: quality-guard/commit-gate :: Architectural acknowledgements bind to staged content :: Source changes after acknowledgement -->

## 2. Architecture Evidence

- [x] 2.1 Extend the shared parser facts for TypeScript, JavaScript, C#, Java, and Kotlin to expose top-level types, members, visibility, imports, references, and forwarding paths. Add realistic before-and-after fixtures for structural growth and body-only edits.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Responsibility growth carries concrete evidence :: Existing class gains a new dependency and operation -->
<!-- covers: quality-guard/architecture-analysis :: Responsibility growth carries concrete evidence :: Method changes without structural growth -->

- [x] 2.2 Extend the same parser facts and before-and-after fixture contract for Rust, Python, Go, C, and C++. Require an explicit analysis error when a changed supported file cannot yield required facts.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Every finding is reproducible :: Required analysis cannot complete -->

- [x] 2.3 Implement placement analysis over affected directories, including direct production-type counts, configured limits, generic buckets, test-support exclusions, and deterministic before-and-after evidence.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Placement analysis detects flat and generic accumulation :: Overloaded directory gains another class -->
<!-- covers: quality-guard/architecture-analysis :: Placement analysis detects flat and generic accumulation :: Type is placed in a domain directory -->

- [x] 2.4 Build the production dependency graph and detect configured forbidden directions and newly introduced cycles. Add fixtures that show the offending edge and complete cycle.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Dependency boundaries are enforceable :: Policy imports a forbidden driver -->
<!-- covers: quality-guard/architecture-analysis :: Dependency boundaries are enforceable :: Staged edge closes a cycle -->

- [x] 2.5 Implement encapsulation and bounded Git co-change evidence for public-surface growth, test-only seams, forwarding compatibility paths, and files outside their historical structural cluster.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Encapsulation and change locality are measured :: Public surface grows without a production caller -->
<!-- covers: quality-guard/architecture-analysis :: Encapsulation and change locality are measured :: File is outside the historical change cluster -->

- [x] 2.6 Implement refactor progress comparison across responsibility owners, dependency edges, placement, public surface, and deleted compatibility paths. Prove local-only polish produces no architectural progress.
<!-- status: completed -->
<!-- covers: quality-guard/architecture-analysis :: Refactor analysis reports structural progress :: Responsibility moves to a focused module -->
<!-- covers: quality-guard/architecture-analysis :: Refactor analysis reports structural progress :: Refactor only renames and reformats -->

## 3. Authoritative Commit Gate

- [x] 3.1 Implement the shared decision core that combines scanner regressions, hard bounds, architecture failures, analysis errors, and review findings with `FAIL` before `REVIEW_REQUIRED` before `PASS`. Include documentation-only input behavior.
<!-- status: completed -->
<!-- covers: quality-guard/commit-gate :: Verdict states have fixed precedence :: Failure and review finding coexist -->
<!-- covers: quality-guard/commit-gate :: Verdict states have fixed precedence :: All evidence is accepted -->
<!-- covers: quality-guard/commit-gate :: Non-source commits report their limited scope :: Documentation-only commit -->

- [x] 3.2 Add `quality-guard check --staged` dispatch to the bundled executable with change and refactor intent, required refactor target, human and JSON rendering, and exit codes 0, 1, 2, and 3.
<!-- status: completed -->
<!-- covers: quality-guard/commit-gate :: One command judges the staged change :: Ordinary staged change is checked -->
<!-- covers: quality-guard/commit-gate :: One command judges the staged change :: Refactor target is missing -->
<!-- covers: quality-guard/commit-gate :: Process exit codes preserve the verdict :: Review blocks a Git hook -->
<!-- covers: quality-guard/commit-gate :: Process exit codes preserve the verdict :: Invalid option is passed -->

- [x] 3.3 Add the empty tracked architecture decision record and `quality-guard acknowledge` command. Accept only current review findings, record reason and author, ignore stale fingerprints, and refuse deterministic findings.
<!-- status: completed -->
<!-- covers: quality-guard/commit-gate :: Architectural acknowledgements bind to staged content :: Finding is acknowledged for the current stage -->
<!-- covers: quality-guard/commit-gate :: Architectural acknowledgements bind to staged content :: Source changes after acknowledgement -->

- [x] 3.4 Add refactor-target input and responsibility-map loading to the decision core. Require a desired ownership or boundary outcome and return review-required when local metrics improve without structural progress.
<!-- status: completed -->
<!-- covers: quality-guard/commit-gate :: Refactor intent requires structural evidence :: Local metrics improve without ownership change -->
<!-- covers: quality-guard/commit-gate :: Refactor intent requires structural evidence :: Declared structural outcome is achieved -->

- [x] 3.5 Add committed-tree execution for CI and parity tests that feed identical local-index and committed-tree fixtures through the same decision core and compare verdicts and ordered finding identifiers.
<!-- status: completed -->
<!-- covers: quality-guard/commit-gate :: Local and CI execution agree :: Commit bypasses the local hook -->
<!-- covers: quality-guard/commit-gate :: Local and CI execution agree :: Local and CI inputs match -->

## 4. MCP Surface

- [x] 4.1 Add `quality_commit_gate` to the MCP server with root, intent, and target inputs. Route it through the shared decision core, preserve concise text errors, and update tool-list and CLI-parity tests.
<!-- status: completed -->
<!-- covers: quality-guard/mcp-tools :: Server exposes three tools :: Client lists the tools -->
<!-- covers: quality-guard/mcp-tools :: Commit-gate tool uses the authoritative decision :: Agent checks a staged change -->
<!-- covers: quality-guard/mcp-tools :: Commit-gate tool uses the authoritative decision :: Refactor tool call omits target -->

## 5. Write-Time Feedback

- [x] 5.1 Make the PostToolUse gate treat the tracked baseline as read-only. When no baseline exists, run absolute hard-bound checks without claiming a regression. Add byte-for-byte baseline preservation tests for allowed and blocked writes.
<!-- status: completed -->
<!-- covers: quality-guard/write-gate :: Gate declines work it cannot judge :: Markdown file written -->
<!-- covers: quality-guard/write-gate :: Gate declines work it cannot judge :: Repository has no baseline -->
<!-- covers: quality-guard/write-gate :: A blocked write records nothing :: Oversized new file is blocked -->
<!-- covers: quality-guard/write-gate :: A blocked write records nothing :: Write is allowed after adoption -->

- [x] 5.2 Replace the multiplied new-file ceiling with normal scanner hard bounds and presence errors. Update block and success messages to identify the check as file-local and direct commit callers to the staged gate.
<!-- status: completed -->
<!-- covers: quality-guard/write-gate :: A new file is held to normal hard bounds :: New file exceeds normal file limit -->
<!-- covers: quality-guard/write-gate :: A new file is held to normal hard bounds :: New file contains a second top-level type -->
<!-- covers: quality-guard/write-gate :: Write-time success is not commit evidence :: File-local write passes -->
<!-- covers: quality-guard/write-gate :: Write-time success is not commit evidence :: Project-level rule could not run -->

## 6. Architecture-First Refactor Planning

- [x] 6.1 Rewrite quality-refactor discovery so it records responsibilities, current owners, consumers, dependencies, desired owners, directories, public boundaries, and compatibility removals before creating implementation tasks.
<!-- status: completed -->
<!-- covers: quality-guard/quality-refactor :: responsibility map drives architectural work :: Existing class owns unrelated responsibilities -->
<!-- covers: quality-guard/quality-refactor :: responsibility map drives architectural work :: Scanner reports local symptoms -->
<!-- covers: quality-guard/quality-refactor :: desired ownership is defined before implementation tasks :: Responsibility needs a new module -->
<!-- covers: quality-guard/quality-refactor :: desired ownership is defined before implementation tasks :: Public contract must remain stable -->

- [ ] 6.2 Replace per-file and worst-file task generation with independently runnable responsibility moves, necessary call-site and test migrations, dependency ordering, and bounded responsibility clusters for large scopes.
<!-- covers: quality-guard/quality-refactor :: task boundaries follow structural outcomes :: Extraction needs call-site migration -->
<!-- covers: quality-guard/quality-refactor :: task boundaries follow structural outcomes :: Several local symptoms share one cause -->
<!-- covers: quality-guard/quality-refactor :: scope stays within the target :: out-of-scope violations reported only -->
<!-- covers: quality-guard/quality-refactor :: scope stays within the target :: large scope batches the worst files first -->
<!-- covers: quality-guard/quality-refactor :: scope stays within the target :: concept word argument requires user confirmation -->

- [ ] 6.3 Update refactor verification and reporting to allow ordered temporary metric redistribution, keep initial tracked baselines unchanged, require passing behavior checks, and compare final architectural evidence with the declared target structure.
<!-- covers: quality-guard/quality-refactor :: measurement guards against regression :: proposed change would add violations -->
<!-- covers: quality-guard/quality-refactor :: measurement guards against regression :: build or tests already failing stops the run -->
<!-- covers: quality-guard/quality-refactor :: measurement guards against regression :: baseline recorded before planning -->
<!-- covers: quality-guard/quality-refactor :: architectural completion needs structural evidence :: Polished structure remains unchanged -->
<!-- covers: quality-guard/quality-refactor :: architectural completion needs structural evidence :: Desired structure and behavior checks pass -->

## 7. Repository Integration and Verification

- [ ] 7.1 Wire committed-tree quality checking into the CI static-analysis job after the existing structural ratchet. Add focused CI-script tests that prove a local-hook bypass cannot avoid `FAIL` or `REVIEW_REQUIRED`.
<!-- covers: quality-guard/commit-gate :: Local and CI execution agree :: Commit bypasses the local hook -->

- [ ] 7.2 Update quality-guard user documentation, package descriptions, skill references, and package architecture guidance to distinguish write feedback, staged decisions, architectural review, acknowledgements, and optional repository-owned Git-hook wiring.
<!-- covers: quality-guard/write-gate :: Write-time success is not commit evidence :: File-local write passes -->

- [ ] 7.3 Run focused quality-guard tests, the package build and bundle, all workspace tests, Biome, plugin validation, package smoke, `dod-guard cover recalibrate-quality-guard-architecture-gate`, and strict OpenSpec validation. Record the real command results without marking unwired scenarios as verified.
