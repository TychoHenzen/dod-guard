## 1. Package foundation and repository integration

- [x] 1.1 Create `packages/fossil` with package metadata, TypeScript config, shared esbuild config, package documentation, and the requested source module boundaries.
<!-- status: completed -->
- [x] 1.2 Define the normalized option, Git activity, reference graph, score, burst report, warning, JSON report, and workspace-debris types in `src/types.ts`.
<!-- status: completed -->
- [x] 1.3 Add reusable temporary-repository, recorded-history, source-tree, output-capture, and deterministic-clock test fixtures.
<!-- status: completed -->
- [x] 1.4 Change plugin validation to identify plugin workspaces by manifest, add passing and failing CLI-workspace fixtures, and keep repo-wide shipped-content checks active.
<!-- status: completed -->
- [x] 1.5 Add fossil to the root lockfile, workspace build and bundle flow, coverage ratchet, test-presence gate, Biome scope, structural scan, and a CLI-specific package-integrity smoke check.
<!-- status: completed -->

## 2. Git activity and burst analysis

- [x] 2.1 Parse non-merge NUL-delimited Git history without counting merge file activity.
<!-- covers: fossil/burst-analysis :: History activity model :: Merge commits do not add activity -->
<!-- status: completed -->
- [x] 2.2 Resolve rename chains into one logical file and report its current path.
<!-- covers: fossil/burst-analysis :: History activity model :: Rename preserves logical identity -->
<!-- status: completed -->
- [ ] 2.3 Apply normalized extension filters before burst and file activity calculations.
<!-- covers: fossil/burst-analysis :: History activity model :: Extension filter limits history -->
- [ ] 2.4 Split consecutive commits when their time gap exceeds the configured threshold.
<!-- covers: fossil/burst-analysis :: Temporal burst detection :: Gap above threshold splits commits -->
- [ ] 2.5 Keep consecutive commits together when their gap equals the configured threshold.
<!-- covers: fossil/burst-analysis :: Temporal burst detection :: Gap at threshold keeps commits together -->
- [ ] 2.6 Implement weighted five-commit change-point detection for close disjoint work.
<!-- covers: fossil/burst-analysis :: File-set change-point detection :: Disjoint close work becomes separate bursts -->
- [ ] 2.7 Reject a close change-point split when either resulting partition is too small.
<!-- covers: fossil/burst-analysis :: File-set change-point detection :: Small partition prevents a close split -->
- [ ] 2.8 Implement deterministic change-point tie-breaking and recursive partitioning.
<!-- covers: fossil/burst-analysis :: File-set change-point detection :: Deterministic recursive split order -->
- [ ] 2.9 Drop closed clusters below the minimum commit or distinct-file count.
<!-- covers: fossil/burst-analysis :: Burst qualification :: Ordinary small cluster is dropped -->
- [ ] 2.10 Suppress survivor and candidate output for a temporal cluster that is not yet closed.
<!-- covers: fossil/burst-analysis :: Burst qualification :: Recent temporal cluster remains unfinished -->
- [ ] 2.11 Classify files with at least three later commits as survivors.
<!-- covers: fossil/burst-analysis :: Consolidation classification :: Absolute survivor threshold -->
- [ ] 2.12 Classify files reaching the positive relative activity threshold as survivors.
<!-- covers: fossil/burst-analysis :: Consolidation classification :: Relative survivor threshold -->
- [ ] 2.13 Classify an existing non-survivor as a burst-specific fossil candidate.
<!-- covers: fossil/burst-analysis :: Consolidation classification :: Quiet current file becomes a candidate -->
- [ ] 2.14 Record deleted non-survivors without reporting them as fossils.
<!-- covers: fossil/burst-analysis :: Consolidation classification :: Deleted file is not fossilized -->
- [ ] 2.15 Normalize committer epoch timestamps and stabilize equal-time ordering.
<!-- covers: fossil/burst-analysis :: History activity model :: Commit time is deterministic -->
- [ ] 2.16 Warn on future-dated commits and leave their cluster unfinished.
<!-- covers: fossil/burst-analysis :: History activity model :: Future commit time is incomplete evidence -->
- [ ] 2.17 Keep copies and delete-recreate sequences as separate logical identities.
<!-- covers: fossil/burst-analysis :: History activity model :: Copy or delete-recreate starts another identity -->
- [ ] 2.18 Normalize extension option dots and letter case.
<!-- covers: fossil/burst-analysis :: History activity model :: Extension values are normalized -->
- [ ] 2.19 Detect shallow history and add a completeness warning.
<!-- covers: fossil/burst-analysis :: History completeness reporting :: Shallow history is reported -->
- [ ] 2.20 Detect sparse checkout and add a current-tree completeness warning.
<!-- covers: fossil/burst-analysis :: History completeness reporting :: Sparse checkout is reported -->
- [ ] 2.21 Return a successful zero-burst report for an empty Git repository.
<!-- covers: fossil/burst-analysis :: History completeness reporting :: Empty repository has no bursts -->
- [ ] 2.22 Make recursive close splits define final burst membership and statistics.
<!-- covers: fossil/burst-analysis :: File-set change-point detection :: Close split refines temporal clustering -->
- [ ] 2.23 Prevent the relative survivor rule from selecting files when all later counts are zero.
<!-- covers: fossil/burst-analysis :: Consolidation classification :: Zero post-burst maximum creates no relative survivor -->

## 3. Reference graph and strength grading

- [ ] 3.1 Return unavailable reference subscores without failing when a candidate language has no backend.
<!-- covers: fossil/reference-analysis :: Replaceable reference backend :: Unsupported language degrades to Git evidence -->
- [ ] 3.2 Convert an unreadable eligible source file into a report warning and continue analysis.
<!-- covers: fossil/reference-analysis :: Replaceable reference backend :: Unreadable source does not stop analysis -->
- [ ] 3.3 Resolve static imports, `require()`, and dynamic `import()` across current TypeScript and JavaScript files.
<!-- covers: fossil/reference-analysis :: TypeScript and JavaScript references :: JavaScript module forms create graph edges -->
- [ ] 3.4 Resolve an unambiguous namespace-level C# `using` through path and namespace conventions.
<!-- covers: fossil/reference-analysis :: C# references :: Unambiguous C# namespace resolves -->
- [ ] 3.5 Preserve an ambiguous C# namespace as unresolved rather than inventing an edge.
<!-- covers: fossil/reference-analysis :: C# references :: Ambiguous C# namespace is not invented -->
- [ ] 3.6 Resolve Rust `use crate::...` and `mod ...;` references to current module files.
<!-- covers: fossil/reference-analysis :: Rust references :: Rust module statement creates graph edge -->
- [ ] 3.7 Grade a candidate usage outside fallback regions as a strong inbound reference.
<!-- covers: fossil/reference-analysis :: Reference strength :: Normal direct use is strong -->
- [ ] 3.8 Grade imports used only inside try or catch regions as weak.
<!-- covers: fossil/reference-analysis :: Reference strength :: Try or catch use is weak -->
- [ ] 3.9 Grade imports used only in fallback conditionals or default expressions as weak.
<!-- covers: fossil/reference-analysis :: Reference strength :: Conditional fallback use is weak -->
- [ ] 3.10 Grade imports used only behind C# preprocessor or Rust cfg guards as weak.
<!-- covers: fossil/reference-analysis :: Reference strength :: Guarded use is weak -->
- [ ] 3.11 Regrade candidate-to-candidate graph edges as vestigial before scoring.
<!-- covers: fossil/reference-analysis :: Vestigial references :: Fossils do not keep each other alive -->
- [ ] 3.12 Mark candidate reference evidence unavailable when a potentially matching reference remains unresolved.
<!-- covers: fossil/reference-analysis :: Replaceable reference backend :: Potentially relevant unresolved reference is incomplete evidence -->
- [ ] 3.13 Grade mixed fallback and normal usage as strong.
<!-- covers: fossil/reference-analysis :: Reference strength :: Mixed normal and fallback use is strong -->
- [ ] 3.14 Reject relative import targets that escape canonical repository containment.
<!-- covers: fossil/reference-analysis :: Repository-contained source reads :: Relative import cannot escape the repository -->
- [ ] 3.15 Prevent traversal of directory symlinks during source inventory.
<!-- covers: fossil/reference-analysis :: Repository-contained source reads :: Directory symlink is not traversed -->
- [ ] 3.16 Skip oversized source with a warning and unavailable affected reference evidence.
<!-- covers: fossil/reference-analysis :: Bounded source scanning :: Oversized source degrades reference evidence -->
- [ ] 3.17 Stop further reads at the total content budget and preserve incomplete evidence.
<!-- covers: fossil/reference-analysis :: Bounded source scanning :: Total scan budget stops further content reads -->
- [ ] 3.18 Detect and omit binary files before regex parsing.
<!-- covers: fossil/reference-analysis :: Bounded source scanning :: Binary file is not regex parsed -->
- [ ] 3.19 Detect file replacement or disappearance between inventory and content read.
<!-- covers: fossil/reference-analysis :: Repository-contained source reads :: File changes during scanning -->

## 4. Fossil scoring and burst assembly

- [ ] 4.1 Normalize a candidate's burst commits against the burst maximum.
<!-- covers: fossil/scoring :: Churn score :: Churn is normalized within a burst -->
- [ ] 4.2 Assign full abandonment when a candidate has no later commits.
<!-- covers: fossil/scoring :: Abandonment score :: Complete abandonment scores one -->
- [ ] 4.3 Scale abandonment linearly against burst activity and clamp it at zero.
<!-- covers: fossil/scoring :: Abandonment score :: Continued activity lowers abandonment linearly -->
- [ ] 4.4 Assign full reference weakness when no strong live inbound reference exists.
<!-- covers: fossil/scoring :: Reference weakness score :: Only weak or vestigial references remain -->
- [ ] 4.5 Assign half reference weakness for exactly one strong live inbound reference.
<!-- covers: fossil/scoring :: Reference weakness score :: One strong live reference remains -->
- [ ] 4.6 Assign zero reference weakness for two or more strong live inbound references.
<!-- covers: fossil/scoring :: Reference weakness score :: Multiple strong live references remain -->
- [ ] 4.7 Assign full isolation when every resolved neighbor is a fossil candidate.
<!-- covers: fossil/scoring :: Cluster isolation score :: Candidate only references fossils -->
- [ ] 4.8 Assign full isolation when the candidate has no resolved neighbors.
<!-- covers: fossil/scoring :: Cluster isolation score :: Candidate has no resolved neighbors -->
- [ ] 4.9 Assign zero isolation when every resolved neighbor is live.
<!-- covers: fossil/scoring :: Cluster isolation score :: Candidate only references live code -->
- [ ] 4.10 Combine four available subscores with the fixed fossil weights.
<!-- covers: fossil/scoring :: Combined fossil score :: Complete scoring uses fixed weights -->
- [ ] 4.11 Renormalize churn and abandonment weights when reference signals are unavailable.
<!-- covers: fossil/scoring :: Combined fossil score :: Missing reference analysis renormalizes Git signals -->
- [ ] 4.12 Include candidates whose score exactly equals the configured threshold.
<!-- covers: fossil/scoring :: Threshold and burst assembly :: Threshold is inclusive -->
- [ ] 4.13 Preserve independent evidence when one path qualifies in more than one burst.
<!-- covers: fossil/scoring :: Threshold and burst assembly :: Same path can carry burst-specific evidence -->
- [ ] 4.14 Make both reference subscores unavailable together for incomplete candidate reference analysis.
<!-- covers: fossil/scoring :: Combined fossil score :: Reference subscores are available as a pair -->
- [ ] 4.15 Mark every fossil finding advisory even at the maximum score.
<!-- covers: fossil/scoring :: Advisory-only findings :: High score is not deletion authority -->

## 5. Workspace-debris review category

- [ ] 5.1 Evaluate old untracked non-ignored files for workspace-debris evidence.
<!-- covers: fossil/workspace-debris :: Workspace file discovery :: Old untracked file is eligible -->
- [ ] 5.2 Evaluate old ignored files and retain their matching ignore rule.
<!-- covers: fossil/workspace-debris :: Workspace file discovery :: Old ignored file is eligible -->
- [ ] 5.3 Omit workspace files newer than the configured age threshold.
<!-- covers: fossil/workspace-debris :: Workspace file discovery :: Recent workspace file is omitted -->
- [ ] 5.4 Use modification time when creation time is unavailable or unreliable.
<!-- covers: fossil/workspace-debris :: Portable age evidence :: Unavailable creation time does not block analysis -->
- [ ] 5.5 Omit an old workspace file when inbound usage evidence is discovered.
<!-- covers: fossil/workspace-debris :: Usage evidence search :: Referenced old file is omitted -->
- [ ] 5.6 Report an old workspace file with no discovered inbound usage evidence.
<!-- covers: fossil/workspace-debris :: Usage evidence search :: Unreferenced old file is reported -->
- [ ] 5.7 Exclude dependency-store contents from workspace inspection and findings.
<!-- covers: fossil/workspace-debris :: Safe workspace boundaries :: Dependency store is excluded -->
- [ ] 5.8 Exclude sensitive environment-file paths and content from findings.
<!-- covers: fossil/workspace-debris :: Safe workspace boundaries :: Sensitive file is excluded -->
- [ ] 5.9 Exclude symlinks whose resolved targets leave the repository.
<!-- covers: fossil/workspace-debris :: Safe workspace boundaries :: External symlink is excluded -->
- [ ] 5.10 Label debris findings for review without making deletion claims.
<!-- covers: fossil/workspace-debris :: Review-only reporting :: Finding preserves uncertainty -->
- [ ] 5.11 Summarize large ignored trees in normal table output while retaining detailed data elsewhere.
<!-- covers: fossil/workspace-debris :: Review-only reporting :: Large ignored tree is summarized -->
- [ ] 5.12 Include workspace files exactly on the modification-age cutoff.
<!-- covers: fossil/workspace-debris :: Workspace file discovery :: Age threshold is inclusive -->
- [ ] 5.13 Distinguish Git-discovered unreadable workspace paths from debris findings.
<!-- covers: fossil/workspace-debris :: Workspace file discovery :: Unreadable discovered path is distinguished -->
- [ ] 5.14 Test debris age immediately before, at, and after one captured cutoff.
<!-- covers: fossil/workspace-debris :: Portable age evidence :: One captured time controls age boundaries -->
- [ ] 5.15 Apply caller exclusion globs before metadata access and output.
<!-- covers: fossil/workspace-debris :: Safe workspace boundaries :: Caller exclusion hides a path completely -->

## 6. CLI, API, and output contracts

- [ ] 6.1 Implement the analyze command, omitted repository path, and documented defaults.
<!-- covers: fossil/cli :: Analyze command :: Defaults are applied -->
- [ ] 6.2 Normalize and apply every explicit analysis option.
<!-- covers: fossil/cli :: Analyze command :: Explicit options are applied -->
- [ ] 6.3 Reject invalid values, unknown options, and extra arguments with usage exit code 2.
<!-- covers: fossil/cli :: Argument validation :: Invalid arguments use the usage exit -->
- [ ] 6.4 Render each burst with its statistics and survivors before candidate score rows.
<!-- covers: fossil/cli :: Table output :: Burst table keeps context together -->
- [ ] 6.5 Add one evidence explanation line per verbose candidate.
<!-- covers: fossil/cli :: Table output :: Verbose table explains a candidate -->
- [ ] 6.6 Suppress ANSI escapes whenever table output is redirected.
<!-- covers: fossil/cli :: Table output :: Redirected table contains no ANSI escapes -->
- [ ] 6.7 Serialize one schema-version-1 JSON document without table prose.
<!-- covers: fossil/cli :: Versioned JSON output :: JSON output is machine-readable -->
- [ ] 6.8 Report both burst-path finding totals and unique candidate path totals in JSON.
<!-- covers: fossil/cli :: Versioned JSON output :: JSON distinguishes row and path totals -->
- [ ] 6.9 Export `analyzeRepository()` and prove parity with CLI JSON report data.
<!-- covers: fossil/cli :: Programmatic API parity :: CLI and API agree -->
- [ ] 6.10 Exit successfully and report zero when analysis produces no findings.
<!-- covers: fossil/cli :: Process outcomes :: No findings is successful -->
- [ ] 6.11 Convert a non-repository Git failure into stderr diagnostic and exit code 1.
<!-- covers: fossil/cli :: Process outcomes :: Non-repository is an analysis failure -->
- [ ] 6.12 Add the 5,000-commit and 1,000-file performance fixture and enforce the 10-second CI bound.
<!-- covers: fossil/cli :: Analysis performance :: Target-size fixture meets runtime bound -->
- [ ] 6.13 Escape repository-derived terminal control characters in table output.
<!-- covers: fossil/cli :: Table output :: Repository text cannot control the terminal -->
- [ ] 6.14 Preserve nonfatal warnings as successful sorted JSON data.
<!-- covers: fossil/cli :: Versioned JSON output :: Nonfatal warnings remain successful data -->
- [ ] 6.15 Map typed API failures to CLI exit codes without partial success output.
<!-- covers: fossil/cli :: Programmatic API parity :: Typed API failure maps to CLI status -->
- [ ] 6.16 Pass metacharacter-containing repository paths to Git as one non-shell argument.
<!-- covers: fossil/cli :: Safe Git execution :: Repository path is data, not a command -->
- [ ] 6.17 Preserve unusual Git filenames through NUL-delimited parsing.
<!-- covers: fossil/cli :: Safe Git execution :: Unusual filename remains one structured path -->
- [ ] 6.18 Disable Git pagers and interactive prompts for every subprocess.
<!-- covers: fossil/cli :: Safe Git execution :: Git cannot open an interactive process -->
- [ ] 6.19 Fail explicitly when included commit records exceed the resource limit.
<!-- covers: fossil/cli :: Analysis resource bounds :: Commit limit fails explicitly -->
- [ ] 6.20 Fail explicitly when current inventory exceeds the resource limit.
<!-- covers: fossil/cli :: Analysis resource bounds :: File inventory limit fails explicitly -->
- [ ] 6.21 Add the CLI-only workspace integrity check without an MCP handshake.
<!-- covers: fossil/cli :: CLI-only package contract :: Fossil package passes CLI integrity checks -->
- [ ] 6.22 Disable repository-configured filesystem monitors and external diff helpers.
<!-- covers: fossil/cli :: Safe Git execution :: Repository Git helper is disabled -->
- [ ] 6.23 Reject unsupported Git versions before history analysis.
<!-- covers: fossil/cli :: Safe Git execution :: Unsupported Git version fails capability check -->
- [ ] 6.24 Stream and terminate Git ingestion at byte or status-record limits.
<!-- covers: fossil/cli :: Analysis resource bounds :: Git byte or status limit terminates ingestion -->

## 7. Documentation and final verification

- [ ] 7.1 Document installation from the workspace, CLI examples, option defaults, scoring interpretation, JSON schema, supported languages, and the review-only debris boundary.
- [ ] 7.2 Update the root monorepo overview and package architecture guidance for the CLI-only fossil workspace.
- [ ] 7.3 Run fossil package build, tests, bundle, CLI smoke, coverage, Biome, and structural checks; repair any new failure without weakening a gate.
- [ ] 7.4 Run the repository-wide build, tests, plugin validation, package integrity, audit, all ratchets, and strict OpenSpec validation.
- [ ] 7.5 Run `dod-guard cover add-fossil-cli` and add or correct test markers until every scenario has a distinct scenario-specific assertion and is bound with no regression.
