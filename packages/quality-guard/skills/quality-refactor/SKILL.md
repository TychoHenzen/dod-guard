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

## Start

1. Resolve the current GitHub repository and its single linked open Project.
2. Use the selected issue as the refactor contract. Create one only when the
   user explicitly requested a new quality task and none exists.
3. Require a passing baseline build and test run.
4. Run the scanner twice. Save work units to `.quality/units.json` and the full
   repository report to `.quality/quality-report.json`.

```text
node <quality-scan.mjs> <scope> --top=20
node <quality-scan.mjs> <scope> --format=units > .quality/units.json
```

The scanner is at
`${CLAUDE_PLUGIN_ROOT}/skills/quality-refactor/scripts/quality-scan.mjs`.
It supports TypeScript, JavaScript, C#, Rust, Python, Go, Java, Kotlin, C, and
C++.

## Plan from ownership

Inspect affected definitions, callers, tests, imports, and dependency edges.
Record the responsibility map in `.quality/responsibility-discovery.json`.
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

## Execute

Work through ready sub-issues in dependency order. For each one:

1. Make the smallest coherent responsibility change.
2. Run its behavior tests and a fresh scoped scan.
3. Inspect and stage only its files.
4. Commit and push the result on the issue branch.
5. Comment the commit and checks on the sub-issue, then close it.

Re-scan after every structural wave because deletions and moves invalidate the
old work-unit ranking. Do not modify a tracked ratchet baseline merely to make
a regression pass.

## Finish

Run the full build, tests, staged commit gate, and final scanner with
`--fail-on=error`. Regenerate `.quality/quality-report.json`. The result is
complete only when the declared ownership and dependency outcomes hold, not
when counts alone improve. Leave the parent issue and pull request open for
human review and merge.

Rules and remediation guidance live in `reference/rules.md` and
`reference/catalog.md`.
