---
name: quality-refactor
description: >
  Refactor code against quality-guard's structural rules. Use for reducing
  complexity, splitting responsibilities, removing dead code, or a repository
  quality pass. Records the work as GitHub issue sub-issues and stores
  diagnostic evidence under `.quality/`.
argument-hint: "[repository, directory, module, or files]"
---

# Quality refactor

Preserve behavior. Scanner findings are symptoms, not architecture, so treat
each one as a lead to check against the code and not as an order.

## Defaults and evidence

Scope is a repository-relative scope. With no argument, it is the
repository root. It never widens to another checkout. Resolve `<repository>`
once and reuse it for every command. Scope and root are separate: scope picks
what to scan, root locates the repository, so always pass `--root` explicitly.

Findings are advisory evidence ranked high, medium, or low. There is
no profile selection. Never rewrite configuration or evidence to improve a score.

Build and tests must pass before you plan. If build, tests, scanning, or
report generation fails, keep the failure visible and repair the owning path
when it is in scope. Create `.quality/` if it is absent.
Run the scanner twice, first in readable form and then as units:

```text
node <quality-scan.mjs> . --root=<repository> --top=20
node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json
quality-guard report --root=<repository> > .quality/quality-report.json
```

The scanner path is
`${CLAUDE_PLUGIN_ROOT}/skills/quality-refactor/scripts/quality-scan.mjs`.

Optional test-quality evidence comes from:

```text
quality-guard test-quality --root=<repository> --evidence=.quality/test-quality.json
```

Read that evidence against Clean Code T1-T9. It accepts normalized C#, Python,
TypeScript, and Rust evidence, and also JavaScript, Go, Java, Kotlin, C, and
C++. It needs behavior and boundary IDs with input and expected oracles,
linked near-bug evidence, runtime failure signatures, and declared timing
environments. Missing provider output, oracles, skip reasons,
or timing budgets make the evidence unavailable or invalid. They are never a
defect in the code. Coverage is a gap signal, not a percentage gate.

References, read as needed:

- `reference/rules.md` explains each rule. Its matrix is the policy catalog,
  and its thresholds are starting points. Consult the dispositions before
  adding a syntax-only finding, and do not treat a bare ASSUMPTION comment as
  a generic scanner violation.
- `reference/catalog.md` lists remediation shapes.
- [`reference/dispositions.md`](reference/dispositions.md) lists allowed
  outcomes. Dispositions apply to chapter-only outcomes.

Evidence files are `.quality/units.json`, `.quality/quality-report.json`, and
`.quality/responsibility-map.json`. Reports and hook output are read-only. They
never accept a commit or merge and never close an issue.

## Start

1. Resolve the repository and its single linked open GitHub Project.
2. Use the selected issue as the contract for the work.
3. Create a new issue only when the user asks for one explicitly and none
   exists.
4. Before any scan or report command above, check that
   `${CLAUDE_PLUGIN_ROOT}/skills/quality-refactor/scripts/quality-scan.mjs`
   exists and that `quality-guard` resolves on PATH. If either is missing,
   stop and report the resolved path. Do not substitute another scanner, and
   do not write the `.quality/` evidence files by hand.

## Plan from ownership

Inspect definitions, callers, tests, imports, and dependency edges before you
choose a change. Group findings by structural outcome, not by scanner row or
file.

Record the responsibility map in `.quality/responsibility-map.json`.

Write one sub-issue per outcome under the selected issue, in tier order:

- DELETE: dead exports, unused code, shims, worthless tests.
- DEDUPE: shared behavior duplicated across owners.
- SPLIT: mixed responsibilities, misplaced files, oversized owners.
- SIMPLIFY: complex or deeply nested control flow.
- SIGNATURES: excessive parameters, unnamed tuples, stateless methods.
- COSMETIC: line length and comment findings.

Work them in dependency order. Each sub-issue states one outcome, its
boundary, the behavior it preserves, and a verification command. Each stays
open until its commit is pushed. Then add the commit as evidence and close it.

A suggestion is a starting shape, not a recipe. Numeric thresholds are not
universal gates. A C# partial-file split never resolves `file-length` or
`partial-type-length`.

Refresh the units and report evidence with these commands:

```text
node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json
quality-guard report --root=<repository> > .quality/quality-report.json
```

Before each commit, refresh the report evidence. Treat it as read-only evidence
for the next decision.

## Recovery and stops

No hook runs while you edit; run the scanner or read the pull-request gate report for feedback.
Findings and report-provider errors are diagnostic evidence. They make
no
  commit or merge acceptance decision.

Failed or unavailable evidence is never a pass. Rerun the narrowest failed
check first.

Stop and report when you meet any of these:

- credentials
- destructive intent
- unresolved ownership: a finding's symbol has no importer, caller, or test you can name, or two modules both define it. Report both locations, or the symbol and the searches you ran, and change nothing for that finding.
- missing acceptance evidence

Do not apply an arbitrary
  elapsed-time kill to a long task. Wait for a terminal state.

## Execute

For each sub-issue, in order:

1. Before any edit, save the baseline scan. The refreshes above overwrite
   `.quality/units.json`, so it is not the baseline:
   `node <quality-scan.mjs> <scope> --root=<repository> --format=units > .quality/baseline-units.json`
2. Make the smallest coherent change.
3. Run the behavior tests and a fresh scoped scan to a different path, never
   over the baseline:
   `node <quality-scan.mjs> <scope> --root=<repository> --format=units > .quality/after-units.json`
4. Check that the scan no longer shows the finding, or record why it stays.
   If the behavior tests fail, or the scan is worse, do not stage or commit.
   Worse means a finding that is new in a touched file, or a higher count for
   the targeted rule, in `.quality/after-units.json` against
   `.quality/baseline-units.json`. Restore each
   tracked file you changed with `git checkout -- <files>` and delete each
   file you created, by name. Never run `git clean`, which can remove
   `.quality/` evidence. Rework the sub-issue's boundary and keep it open.
   Never commit a red or worse state.
5. Run `git status --porcelain`, stage only its files by explicit path (see "Never"), then refresh the report evidence
6. Commit and push on the issue branch.
7. Comment on the sub-issue with the commit and close it.

Re-scan after each structural wave, because one change can move or expose
others.

## Never

- Never `git add -A` or `git add .`. Stage explicit paths after `git status --porcelain` and account for every `??` line.
- Never stage `.quality/` outputs unless `git ls-files .quality` shows the repository already tracks them.
- Never force-push.
- Never edit a scanner threshold or ignore list to clear a finding. Fix the code or record why the finding stays. This extends "Never rewrite configuration or evidence to improve a score" in "## Defaults and evidence".
- Never close the parent issue or merge the pull request. "## Finish" leaves both open for human review.

## Finish

Run the full build, tests, and a final scanner pass. Concretely: the full build, tests
must pass, the final scanner in advisory mode must run, and the report must
hold current diagnostic evidence.

```text
node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json
quality-guard report --root=<repository> > .quality/quality-report.json
```

Rules and remediation guidance live in the reference files, and they do not
override the issue contract.

Final proof is current diagnostic evidence plus declared ownership and
dependency outcomes, not a numeric verdict. Leave the parent issue and the
pull request open for human review and merge.
