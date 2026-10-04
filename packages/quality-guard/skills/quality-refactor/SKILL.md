---
name: quality-refactor
description: >-
  Refactor code against quality-guard's structural rules. Use when asked to
  reduce complexity, split responsibilities, remove dead code, or perform a
  repository quality pass. Records work as GitHub issue sub-issues and stores
  scanner evidence under .quality/.
argument-hint: "[repository, directory, module, or files]"
---
# Quality refactor

Preserve behavior. Scanner findings identify symptoms, not architecture.

## Defaults and evidence

- Use the supplied repository-relative scope. If no narrower scope is given,
  scan the repository root; never widen the scope to another checkout.
- Use the `default` profile unless the selected issue explicitly requires
  `strict`. Keep the active repository configuration and baseline as evidence,
  not as values to rewrite for a cleaner score.
- Require a passing baseline build and test run before planning changes. Create
  `.quality/` when absent, then run the scanner twice: once for readable
  findings and once with `--format=units`. Resolve `<repository>` once as the
  repository root and pass it explicitly; scope and root are separate.
- Keep `.quality/units.json`, `.quality/quality-report.json`, and
  `.quality/responsibility-map.json` as the handoff evidence. A report is
  read-only; it does not accept a commit or close an issue.

```text
node <quality-scan.mjs> . --root=<repository> --top=20
node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json
quality-guard report --root=<repository> > .quality/quality-report.json
```

When a repository supplies `.quality/test-quality.json`, inspect its explicit
Clean Code T1-T9 evidence separately:

```text
quality-guard test-quality --root=<repository> \
  --evidence=.quality/test-quality.json
```

This report accepts normalized evidence from C#, Python, TypeScript, and Rust.
It requires behavior and boundary IDs with input/expected oracles, linked
near-bug evidence, runtime failure signatures, and declared timing environments
before making the related review signal. Coverage is a gap signal, not a
universal percentage gate.
Missing provider output, behavior oracles, skip reasons, or timing budgets is
reported as unavailable/invalid evidence rather than guessed as a defect.

## Start

1. Resolve the current GitHub repository and its single linked open Project.
2. Use the selected issue as the refactor contract. Create one only when the
   user explicitly requested a new quality task and none exists.
3. Apply the Defaults and evidence contract before planning changes.

The scanner is at
`${CLAUDE_PLUGIN_ROOT}/skills/quality-refactor/scripts/quality-scan.mjs`.
It supports TypeScript, JavaScript, C#, Rust, Python, Go, Java, Kotlin, C, and
C++.

## Plan from ownership

Inspect affected definitions, callers, tests, imports, and dependency edges.
Record the responsibility map in `.quality/responsibility-map.json`.
Group work by structural outcome, never by scanner row or existing file.

Create brief GitHub sub-issues under the selected issue in this order:

1. DELETE: dead exports, unused code, shims, and worthless tests.
2. DEDUPE: shared behavior duplicated across owners.
3. SPLIT: mixed responsibilities, misplaced files, and oversized owners.
4. SIMPLIFY: complex or deeply nested control flow.
5. SIGNATURES: excessive parameters, unnamed tuples, stateless methods.
6. COSMETIC: line length and comment findings.

Each sub-issue states one observable structural outcome, affected boundary,
preserved behavior, and verification command. Keep it open until its commit is
pushed. Add the commit as evidence, then close it.

Before each commit, refresh the report evidence:

```text
node <quality-scan.mjs> . --root=<repository> --top=20
node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json
quality-guard report --root=<repository> > .quality/quality-report.json
```

These commands produce current, read-only evidence. They do not accept a
commit, create a verdict, or write ledger state.

## Recovery and stops

- PostToolUse hook output is file-local, fail-open feedback; it never accepts a
  commit. A report is read-only and is the only quality-refactor evidence path.
- If build, tests, scanning, or report generation fails, keep the failure
  visible, repair the owning path, and rerun the narrowest failed check before
  the full confirmation suite. Do not call failed or unavailable evidence a
  pass.
- If a baseline is missing, malformed, stale, or regresses, inspect the source
  and evidence first. Use `--write-baseline=.github/quality/quality-baseline.json`
  only for a deliberate ratchet update with the old/new fingerprints and reason
  recorded in the issue or commit. For a tracked regression that needs a
  one-shot audited bypass, use root `.quality-skip` with
  `{"rebaseline": true}`, then set the resulting record's `acknowledged` field
  to `true` in `.github/quality/skip-log.json`. Never edit a baseline or waiver
  to hide a finding.
- Scanner, materialization, or report-analysis errors stay visible and stop the
  workflow until their evidence path is available. Findings remain diagnostic;
  this skill has no staged or committed acceptance decision.
- Stop before mutation for credentials, destructive intent, indistinguishable
  unrelated work, unresolved ownership, or missing acceptance evidence. Wait
  for long-running scans to reach terminal state; do not add an arbitrary
  elapsed-time kill.

## Execute

Work through ready sub-issues in dependency order. For each one:

1. Make the smallest coherent responsibility change.
2. Run its behavior tests and a fresh scoped scan.
3. Inspect and stage only its files, then refresh the report evidence.
4. Commit and push the result on the issue branch.
5. Comment the commit and checks on the sub-issue, then close it.

Re-scan after every structural wave because deletions and moves invalidate the
old work-unit ranking. Do not modify a tracked ratchet baseline merely to make
a regression pass.

## Finish

Run the full build, tests, and final scanner in advisory mode, then
regenerate `.quality/quality-report.json`:

```text
node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json
quality-guard report --root=<repository> > .quality/quality-report.json
```

The final proof is current diagnostic evidence plus the declared ownership and
dependency outcomes, not a numeric verdict. Leave the parent issue and pull
request open for human review and merge.

Rules and remediation guidance live in `reference/rules.md` and
`reference/catalog.md`. Chapter-only outcomes that are not generic scanner
rules live in `reference/dispositions.md`.
