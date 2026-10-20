## Outcome

`node scripts/ci/validate-plugins.mjs` prints `plugin configuration OK - <summary>` on success and `plugin configuration FAILED - <n> violation(s) across <summary>` on failure, with an ASCII hyphen instead of the U+2014 em-dash. Every tracked file under `scripts/ci/` is ASCII only. A test that `npm test` runs in CI fails, naming `path:line U+XXXX`, when a non-ASCII character comes back into any tracked `scripts/ci/` file. The check is a pure helper that #892's bundle check can reuse.

## Scope

Included:

- `scripts/ci/validate-plugins.mjs`: the OK line (:47), the FAILED line (:50), and the header comments (:2, :6).
- Every other tracked file under `scripts/ci/` that holds U+2014 (eight files; with `validate-plugins.mjs` that is 9 files and 28 lines, all U+2014): `check-audit.mjs`, `check-coverage.mjs`, `check-tests-present.mjs`, `smoke-bundle.mjs`, `smoke-cli-bundle.mjs`, `lib/content-checks.mjs`, `lib/fs-utils.mjs`, `lib/plugin-checks.mjs`. Replace each em-dash with an ASCII hyphen (` - ` where it separates clauses). Change nothing else in those lines.
- A new pure helper, for example `scripts/ci/lib/ascii-check.mjs`. It takes `{ path, text }` and returns one row per non-ASCII code point, as `path:line U+XXXX`.
- A new test, for example `scripts/ci/ascii-only.test.mjs`, listed in the `test:ci-scripts` script in `package.json`. It unit-tests the helper on inline fixtures and runs it over `git ls-files scripts/ci`. The test file builds its non-ASCII fixtures with `String.fromCodePoint`, so the file itself stays ASCII.

Non-goals:

- `scripts/micro-mutations.mjs` and `scripts/mutation-queue.mjs`. They hold box-drawing characters, arrows, multiplication signs, and emoji status icons, some in generated Markdown report output. Replacing those changes report output, so it needs its own decision and issue.
- The two non-ASCII lines in `packages/quality-guard/src`: `commit-gate/architecture-similarity-clusters.ts:6` (U+00B2 in a comment) and `plaintext/normalization.ts:20` (U+2019 in a regex class, which is functional).
- The backslash-u-2014 string escapes in `packages/quality-guard/skills/quality-refactor/scripts/lib/*.mjs`. They are ASCII bytes in source, so the byte guard does not see them.
- Tracked bundles `packages/*/dist/bundle.js`, which #892 owns.
- A repository-wide ASCII guard over all authored files.
- Editing #892. Its implementer should reuse the helper this PBI adds.

## Implementation notes

### discovery-triage

- Result: one scope question (user constraints or priorities), resolved by the advisor route because this refinement runs inside an active goal-sdlc run. No external-fact or tradeoff gap remains.
- The issue as written asked for line 47 only. Research found the FAILED line in the same function, eight more `scripts/ci/` files with the same character, and no guard. This is the third time this class has turned up (#843 AC-6, #892, #904). That raised the question of scope.

### advisor-decision

- Advisor: Claude advisor tool, invoked once through `dod-guard:codex-advisor`.
- Briefing scope: the research evidence below, the user's standing ASCII and structural-fix rules, and four options. A was line 47 only. B was the whole of `validate-plugins.mjs`. C (the recommended default) was all of `scripts/ci/` plus a guard, with the mutation tools split out. D was a repository-wide guard.
- Advice: take C. A leaves the error path (:50) non-ASCII. D is a repository-wide program that belongs in its own issue. Build the guard as a reusable pure helper with a test that must fail on an inline fixture, because a repository-only run can only pass. List the new test in `test:ci-scripts` and confirm that CI runs it. Record the mutation-tool and quality-guard lines as non-goals rather than creating issues in this stage.
- Accepted, with evidence. `.github/workflows/ci.yml:51` runs `npm test` in the build-test job. `package.json:13` chains `npm run test:ci-scripts`. `package.json:14` is an explicit file list, so the new test must be added there. The header comment of `scripts/ci/validate-plugins.test.mjs` (lines 1-5) records the same vacuous-pass concern.

### research-source

Repository research at master 119d2c30. The strong main thread wrote five questions. One `dod-guard:read-cheap` investigator (haiku, max) answered them, and the main thread rechecked the cited lines.

- Q1, the scope of the character. `scripts/ci/validate-plugins.mjs:47` is the OK write and `:50` is the FAILED write, both inside `emitResult` (`:45-53`), and both hold U+2014. The same file has U+2014 in comments at `:2` and `:6`. The other `scripts/ci/` hits are all U+2014:
  - runtime output: `check-audit.mjs:55,60`, `check-coverage.mjs:67,69`, `check-tests-present.mjs:182`, `smoke-bundle.mjs:232`;
  - an Error message: `smoke-bundle.mjs:138`;
  - report messages and comments: `lib/content-checks.mjs:66,74,127`, `lib/plugin-checks.mjs:155,214,245,260,350,387,395,413,415,422,437`, `lib/fs-utils.mjs:31`, `check-tests-present.mjs:2`, `smoke-cli-bundle.mjs:2`.

  Outside `scripts/ci/`, only `scripts/micro-mutations.mjs` and `scripts/mutation-queue.mjs` carry non-ASCII. Runtime output lines in `plugins/*/skills/**/scripts/` and `packages/*/src/` carry none.
- Q2, consumers of the text. `git grep` for `configuration (OK|FAILED)` matches only the two producer lines. No test, workflow, skill, or doc asserts the message or its separator.
- Q3, how the line is consumed. `.github/workflows/ci.yml:105` runs `node --test scripts/ci/validate-plugins.test.mjs`, and `:108` runs `node scripts/ci/validate-plugins.mjs`. CI uses only the exit code, which is set at `validate-plugins.mjs:86` (`process.exitCode = await main();`). No test exercises `emitResult` or the exit path: `validate-plugins.test.mjs:21-22` imports only the lib modules. No npm script runs `validate-plugins.mjs`.
- Q4, existing enforcement. No test, Biome rule, or scanner rejects non-ASCII in authored source. `scripts/ci/lib/plugin-checks.mjs:19` (`MOJIBAKE_CODES = [0x00c2, 0x00c3, 0x00e2, 0xfffd, 0xfeff]`) and `:83-91` (`badCodePoint`) check only JSON string values in shipped manifests (callers at `:158`, `:224`, `:280`, `:355`, `:427`), and U+2014 is not in that list. #892 (open) adds a non-ASCII check for `packages/*/dist/bundle.js` only. Its body says "#843 narrows its AC-6 to authored files". #843, #853, #854, #855, and #897 are closed, and none of their commits touch `scripts/ci/validate-plugins.mjs` (`git log --oneline master -- scripts/ci/validate-plugins.mjs` lists 7 commits, none tagged with those numbers). Merged work covers no part of this PBI.
- Q5, history. The em-dash lines date from the file's creation in `cd17a281` (2026-07-28). `d396bbe4` (2026-08-19) moved them into `emitResult`.
- Remaining uncertainty: none material. `emitResult` is not exported, and `validate-plugins.mjs` runs `main()` at import time (`:86`). The FAILED-path proof therefore has to run the CLI against a planted violation. It cannot import the function.

### requirements

- As a maintainer on this machine, the `validate-plugins` output and every `scripts/ci/` source file hold only ASCII, so nothing double-encodes on re-read.
- As CI, `npm test` fails and names `path:line U+XXXX` when a non-ASCII character is added to any tracked `scripts/ci/` file.
- As a later implementer (#892), a pure helper exists that reports non-ASCII code points for any `{ path, text }`.
- Constraints: message wording is unchanged apart from the separator character. Exit codes are unchanged (0 for OK, 1 for FAILED). Authored files and commit messages are ASCII only.
- Non-goals: see Scope.

### clarifications

- C1. The scope is all of `scripts/ci/` plus a guard (advisor-decision, option C). The mutation tools under `scripts/` and the quality-guard source lines are non-goals.
- C2. The separator becomes ` - ` (space, hyphen, space), as the issue asked.
- C3. The guard scans tracked files under `scripts/ci/` only, through `git ls-files scripts/ci`, and flags every code point above 0x7E. Tab, LF, and CR are allowed.
- C4. #892 is not edited. Reusing the helper is recorded here for its implementer.

### implementation-plan

- Owners:
  - `scripts/ci/validate-plugins.mjs`;
  - the eight other `scripts/ci/` files listed in Scope;
  - a new `scripts/ci/lib/ascii-check.mjs`;
  - a new `scripts/ci/ascii-only.test.mjs`;
  - `package.json` (`test:ci-scripts`).
- Approach:
  1. T1: replace U+2014 at `validate-plugins.mjs:2,6,47,50` with ASCII. If Edit cannot match a line, use a node script that finds the character with `String.fromCodePoint(0x2014)`.
  2. T2: make the same replacement in the other eight `scripts/ci/` files. Change no other text.
  3. T3: add the pure helper and its test. Unit rows: U+2014, U+2192, and U+FEFF fixtures each return `path:line U+XXXX`; a pure-ASCII text with tab, LF, and CRLF returns nothing. Add a repository row that runs the helper over `git ls-files scripts/ci` and asserts no rows. Add the test to `test:ci-scripts`.
  4. T4: prove the CLI output and the CI wiring, then run the gates.
- Verification approach:
  - the focused test, then `npm run test:ci-scripts` and `npm test`;
  - `node --test scripts/ci/validate-plugins.test.mjs`;
  - `node scripts/ci/validate-plugins.mjs`, with its stdout bytes checked;
  - a planted-violation run for the FAILED line;
  - a planted non-ASCII character for the guard;
  - Biome and preflight;
  - an ASCII check of the authored files and commit messages.

### task-list

None of these tasks needs a separately tracked child, and every task ships on this PBI's one branch and pull request, so there are no child issues. Every task is a parent-level convergence task. T3 depends on T1 and T2, because its repository row passes only once `scripts/ci/` is ASCII. T4 depends on T1, T2, and T3.

```json
[
  {"id": "T1", "title": "Print ASCII OK and FAILED lines from validate-plugins", "parentLevel": "convergence", "independent": false, "dependsOn": [], "evidence": ["ev-t1-change", "ev-lens-implementation"], "acceptanceEvidence": ["ev-ac1-ok-line", "ev-ac2-failed-line"], "verificationEvidence": ["proof-ac1-ok-line", "proof-ac2-failed-line"]},
  {"id": "T2", "title": "Make every tracked scripts/ci file ASCII", "parentLevel": "convergence", "independent": false, "dependsOn": [], "evidence": ["ev-t2-change", "ev-lens-quality"], "acceptanceEvidence": ["ev-ac3-scripts-ci"], "verificationEvidence": ["proof-ac3-scripts-ci"]},
  {"id": "T3", "title": "Guard scripts/ci against non-ASCII with a reusable checker", "parentLevel": "convergence", "independent": false, "dependsOn": ["T1", "T2"], "evidence": ["ev-t3-change", "ev-lens-reliability"], "acceptanceEvidence": ["ev-ac4-guard", "ev-path-data-error", "ev-path-recovery"], "verificationEvidence": ["proof-ac4-guard", "proof-path-data-error", "proof-path-recovery"]},
  {"id": "T4", "title": "Prove the CLI output and CI wiring, then run the gates", "parentLevel": "convergence", "independent": false, "dependsOn": ["T1", "T2", "T3"], "evidence": ["ev-t4-change", "ev-lens-wiring"], "acceptanceEvidence": ["ev-path-interactive-control", "ev-path-browser-e2e", "ev-path-identity", "ev-ac5-gates"], "verificationEvidence": ["proof-path-interactive-control", "proof-path-browser-e2e", "proof-path-identity", "proof-ac5-gates"]}
]
```

### lens-ownership

The record has exactly one entry per review lens. Each lens cites the evidence and proof of its own acceptance-matrix rows, and no two lenses claim the same row. Reliability owns the `data/error` and `recovery` rows. Wiring/usability owns `interactive-control` and the justified-inapplicable `browser/e2e` row, which is what the complete-pr finalization gate (`REQUIRED_LENS_PATHS`) requires.

```json
[
  {"id": "implementation", "owner": "T1", "evidence": ["ev-lens-implementation"], "acceptanceEvidence": ["ev-ac1-ok-line", "ev-ac2-failed-line"], "verificationEvidence": ["proof-ac1-ok-line", "proof-ac2-failed-line"]},
  {"id": "wiring/usability", "owner": "T4", "evidence": ["ev-lens-wiring"], "acceptanceEvidence": ["ev-path-interactive-control", "ev-path-browser-e2e"], "verificationEvidence": ["proof-path-interactive-control", "proof-path-browser-e2e"]},
  {"id": "quality", "owner": "T2", "evidence": ["ev-lens-quality"], "acceptanceEvidence": ["ev-ac3-scripts-ci"], "verificationEvidence": ["proof-ac3-scripts-ci"]},
  {"id": "reliability", "owner": "T3", "evidence": ["ev-lens-reliability"], "acceptanceEvidence": ["ev-path-data-error", "ev-path-recovery"], "verificationEvidence": ["proof-path-data-error", "proof-path-recovery"]}
]
```

### acceptance-evidence

```json
[
  {"id": "AC-1", "evidence": "ac-1-observed"},
  {"id": "AC-2", "evidence": "ac-2-observed"},
  {"id": "AC-3", "evidence": "ac-3-observed"},
  {"id": "AC-4", "evidence": "ac-4-observed"},
  {"id": "AC-5", "evidence": "ac-5-observed"}
]
```

### planned-acceptance-matrix

next-ticket fills these rows in the `## Implementation handoff` comment, with `observed`, `status`, and the pushed `headSha`. Path strings are exact. `browser/e2e` and `identity/authorization` are inapplicable, and each has its own evidence and proof ids.

```json
[
  {"id": "R1", "contract": "AC-1", "path": "success-line", "proof": "proof-ac1-ok-line", "evidence": "ev-ac1-ok-line", "expected": "validate-plugins.mjs holds no byte above 0x7E; emitResult writes 'plugin configuration OK - ' and 'plugin configuration FAILED - ' with the rest of each message unchanged", "status": "pending"},
  {"id": "R2", "contract": "AC-2", "path": "failed-line", "proof": "proof-ac2-failed-line", "evidence": "ev-ac2-failed-line", "expected": "with a planted violation (for example a temporary malformed JSON file that checkJsonSyntax scans, removed afterwards), node scripts/ci/validate-plugins.mjs exits 1 and every stdout byte is at most 0x7E apart from LF; the first line starts 'plugin configuration FAILED - '", "status": "pending"},
  {"id": "R3", "contract": "AC-3", "path": "scripts-ci-ascii", "proof": "proof-ac3-scripts-ci", "evidence": "ev-ac3-scripts-ci", "expected": "no tracked file under scripts/ci holds a byte above 0x7E; git diff -U0 on the touched files shows only em-dash to hyphen replacements; Biome check on scripts/ci/ passes", "status": "pending"},
  {"id": "R4", "contract": "AC-4", "path": "ascii-guard", "proof": "proof-ac4-guard", "evidence": "ev-ac4-guard", "expected": "scripts/ci/ascii-only.test.mjs is listed in package.json test:ci-scripts; its repository row runs the helper over git ls-files scripts/ci and finds no rows; ci.yml build-test runs npm test, which runs test:ci-scripts", "status": "pending"},
  {"id": "R5", "contract": "AC-4", "path": "data/error", "proof": "proof-path-data-error", "evidence": "ev-path-data-error", "expected": "the helper returns 'x.mjs:2 U+2014', a U+2192 row, and a U+FEFF row for inline fixtures built with String.fromCodePoint, and no rows for ASCII text with tab, LF, and CRLF", "status": "pending"},
  {"id": "R6", "contract": "AC-4", "path": "recovery", "proof": "proof-path-recovery", "evidence": "ev-path-recovery", "expected": "after a non-ASCII character is planted in a tracked scripts/ci file, npm run test:ci-scripts fails and names that path:line and code point; after the plant is reverted, it passes again", "status": "pending"},
  {"id": "R7", "contract": "AC-1", "path": "interactive-control", "proof": "proof-path-interactive-control", "evidence": "ev-path-interactive-control", "expected": "on the branch, node scripts/ci/validate-plugins.mjs exits 0 and prints 'plugin configuration OK - <n> plugins, ...' with every stdout byte at most 0x7E apart from LF", "status": "pending"},
  {"id": "R8", "contract": "AC-1", "path": "browser/e2e", "proof": "proof-path-browser-e2e", "evidence": "ev-path-browser-e2e", "expected": "inapplicable", "status": "inapplicable", "reason": "validate-plugins.mjs and the guard are command-line CI scripts with no browser or UI surface; the user path is the CLI run proven by the interactive-control row"},
  {"id": "R9", "contract": "AC-5", "path": "identity/authorization", "proof": "proof-path-identity", "evidence": "ev-path-identity", "expected": "inapplicable", "status": "inapplicable", "reason": "no endpoint, credential, or permission is read or changed; the scripts read local files only"},
  {"id": "R10", "contract": "AC-5", "path": "gates", "proof": "proof-ac5-gates", "evidence": "ev-ac5-gates", "expected": "npm test, npm run test:ci-scripts, node --test scripts/ci/validate-plugins.test.mjs, node scripts/ci/validate-plugins.mjs, the repository Biome check, and npm run preflight:static-analysis pass with no drift; authored files and commit messages hold no byte above 0x7E", "status": "pending"}
]
```

### classification

- Priority `Prio 4 - Non-Urgent` ("Minor inconveniences, cosmetic fixes, or standard requests"). This is a cosmetic output and source fix. CI reads only the exit code (research-source Q3), so nothing is broken or blocked. The guard makes it a standard request rather than a pure cosmetic one.
- Effort `Effort 2 - Easy` ("Simple task. Well-understood with minimal effort or risk"). The work is 28 mechanical character replacements in 9 files, a small pure helper with one test file, and one `package.json` line. No consumer asserts the text (Q2), so the risk is minimal. It is above `Effort 1 - Trivial` because it adds a new test and a planted-failure proof, not only a one-line edit.
- Standard label `bug` ("Something isn't working"). The tracked source and the output break the repository's ASCII-only rule, which exists because non-ASCII text is silently corrupted on the owner's machine.

Refinement convergence proof: the closing refinement comment records the pre-push `evaluateConvergence` result and a simulated post-push `evaluateStructuredFinalization` result for these records.

## Acceptance criteria

- [ ] AC-1 `node scripts/ci/validate-plugins.mjs` exits 0 and prints `plugin configuration OK - <summary>`. Every stdout byte is at most 0x7E apart from LF. `scripts/ci/validate-plugins.mjs` holds no byte above 0x7E, and the message wording is unchanged apart from the separator.
- [ ] AC-2 With a planted violation, `node scripts/ci/validate-plugins.mjs` exits 1 and prints `plugin configuration FAILED - <n> violation(s) across <summary>` in ASCII. The planted violation is removed afterwards.
- [ ] AC-3 No tracked file under `scripts/ci/` holds a byte above 0x7E. The diff of the touched files shows only em-dash to hyphen replacements.
- [ ] AC-4 A pure helper (for example `scripts/ci/lib/ascii-check.mjs`) returns `path:line U+XXXX` for each non-ASCII code point and nothing for ASCII text with tab, LF, or CRLF. A test listed in `test:ci-scripts` unit-tests the helper on inline fixtures, and runs it over `git ls-files scripts/ci` with no rows. A character planted in a tracked `scripts/ci/` file makes `npm run test:ci-scripts` fail and name it. Reverting the plant restores the pass. CI runs the test through `npm test` (`.github/workflows/ci.yml:51`).
- [ ] AC-5 These all pass with no drift: `npm test`, `npm run test:ci-scripts`, `node --test scripts/ci/validate-plugins.test.mjs`, `node scripts/ci/validate-plugins.mjs`, the repository Biome check, and `npm run preflight:static-analysis`. Authored files and commit messages are ASCII only.

## Verification

- AC-1: run `node scripts/ci/validate-plugins.mjs`, and use a node check to confirm that its stdout and the source file hold no byte above 0x7E.
- AC-2: plant one violation, run the script, check the exit code and stdout bytes, then remove the plant and confirm `git status` is clean for it.
- AC-3: run a node byte check over `git ls-files scripts/ci`, then read `git diff -U0` over the touched files.
- AC-4:
  - `node --test scripts/ci/ascii-only.test.mjs`;
  - a planted-character run of `npm run test:ci-scripts`, then the same run after reverting the plant;
  - a read of `package.json:14` and `.github/workflows/ci.yml:51`.
- AC-5:
  - `npm test`;
  - `npm run test:ci-scripts`;
  - `node --test scripts/ci/validate-plugins.test.mjs`;
  - `node scripts/ci/validate-plugins.mjs`;
  - `npx @biomejs/biome check packages/code-explorer/src/ packages/fossil/src/ packages/knowledge-base/src/ packages/quality-guard/src/ scripts/ci/ --no-errors-on-unmatched`;
  - `npm run preflight:static-analysis` reports no changed paths;
  - a node check that the authored files and commit messages hold no byte above 0x7E.

