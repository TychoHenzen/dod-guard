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

The PostToolUse hook gives file-local, fail-open feedback while you edit.
Findings and report-provider errors are diagnostic evidence. They make
no
  commit or merge acceptance decision.

Failed or unavailable evidence is never a pass. Rerun the narrowest failed
check first.

Stop and report when you meet any of these:

- credentials
- destructive intent
- unresolved ownership
- missing acceptance evidence

Do not apply an arbitrary
  elapsed-time kill to a long task. Wait for a terminal state.

## Execute

For each sub-issue, in order:

1. Make the smallest coherent change.
2. Run the behavior tests and a fresh scoped scan.
3. Check that the scan no longer shows the finding, or record why it stays.
4. stage only its files, then refresh the report evidence
5. Commit and push on the issue branch.
6. Comment on the sub-issue with the commit and close it.

Re-scan after each structural wave, because one change can move or expose
others.

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
