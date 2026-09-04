## Why

Compound requirements pack multiple independent obligations into one scenario.
A test bound to that scenario checks one obligation and the coverage gate
reports 1/1, hiding the four untested claims behind it. 47% of existing
scenarios (434 of 929) are compound. The problem originates upstream: the LLM
writing the spec produces compound requirements, and the LLM writing the test
covers the most salient clause and stops. Splitting tests is treating the
symptom. Splitting scenarios is treating the cause.

## What Changes

- A new CI lint script (`scripts/ci/check-spec-hygiene.mjs`) counts RFC 2119
  obligation keywords (`SHALL`, `MUST`, `SHOULD`, `MAY`, `REQUIRED`,
  `OPTIONAL`, `RECOMMENDED`) in each requirement body and compares to the
  scenario count beneath it. A delta > 0 means uncovered obligations. Runs in
  warning-only mode by default. A `--strict` flag exits 1 on any finding.
- A shared detection module (`scripts/ci/lib/obligation-count.mjs`) provides
  the keyword-counting and spec-parsing logic for reuse by the lint script,
  the dashboard, and the splitter skill.
- The openspec-dashboard renders an obligation delta per requirement as a
  yellow chip on the spec detail view, next to the existing bound/total
  coverage chip.
- A new `/spec-split` skill walks compound requirements interactively,
  proposes one scenario per uncovered obligation, re-assigns test bindings
  after a split, and rewrites the spec file.

## Capabilities

### New Capabilities
- `dod-guard/spec-hygiene`: Detection of compound requirements via RFC 2119
  keyword counting, CI lint enforcement, and interactive splitting.

### Modified Capabilities
- `openspec-dashboard/scenario-coverage`: Dashboard gains an obligation-delta
  chip per requirement on the spec detail view.

## Impact

- `scripts/ci/check-spec-hygiene.mjs` and its test added to
  `scripts/ci/`, wired into `plugin-config` CI job
- `scripts/ci/lib/obligation-count.mjs` shared module
- `tools/openspec-dashboard/public/render-spec.mjs` gains obligation chip
- `tools/openspec-dashboard/lib/project-reads.mjs` exposes obligation counts
- New skill directory under `packages/dod-guard/skills/spec-split/`
- Every `openspec/specs/**/spec.md` is a target for the splitter, touched
  only when the user runs the skill interactively
