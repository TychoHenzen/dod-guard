## Context

See proposal.md, section Why, for the census that motivates this change.

Three facts about this repository shape the approach.

The test runner already emits machine-readable results. Every package runs
`node --test`, which accepts `--test-reporter`. So a run produces a per-test
pass, fail or skip record without anyone parsing console text.

Coverage tooling is already installed. `node_modules/.bin/c8` exists, and
`scripts/ci/check-coverage.mjs` already reads the coverage files that the
JavaScript engine writes. c8 matches
its include patterns against loaded files under `packages/<pkg>/dist/**/*.js`
and remaps to sources afterward.

The repository already has a scenario-to-artifact seam. `dod-guard trace`
reads a change's scenarios and a `dod.md.scenario-map.json` sidecar. The
coverage command reads the same scenarios from the same place.

## Goals / Non-Goals

**Goals:**

- Tell a reader which scenario has real evidence behind it and which does not.
- Separate three states that look identical today. A scenario has no test at
  all. Or its test calls the implementation directly. Or its test reaches the
  implementation the way a user does.
- Produce a backfill path that ends at a human, not at a machine-written spec
  nobody read.

**Non-Goals:**

- This change removes no predicate and no MCP tool. The retirement is a
  separate change, and this one has to stand on its own first.
- The coverage command does not block CI. It reports.
- Reachability is not a security boundary. It answers whether a user can reach
  the code, not whether an attacker can.

## Decisions

### The scenario names the test, and the binding lives in the test

A scenario binds to a test by name. The binding is written in the test file, as
a marker on the test case, rather than in a separate mapping file.

Why: the test is the artifact that drifts. When someone renames or deletes a
test, a marker inside it moves or dies with it. A separate mapping file goes
stale silently, and a stale mapping is exactly the failure this change exists
to catch. The `dod.md.scenario-map.json` sidecar is generated, so it does not
have this problem, but a hand-maintained mapping would.

Alternative considered: infer the binding by matching a scenario title against
a test title. Rejected. It is the same substring reasoning that produced the
430 grep proofs, and it reports a pass for a test that merely shares a word.

### Reachability is measured at runtime, not from a static call graph

Run the bound tests under coverage and record which code executed. A test
reaches the implementation through an entry point when the entry point's own
code ran during that test.

Why: TypeScript in this repository dispatches through MCP tool tables, dynamic
`import()`, and mocked modules. A static call graph reports edges that never
run. It also misses edges that only exist at run time. Coverage records what
actually executed, which is the claim being made.

Alternative considered: the `code-review-graph` MCP server already builds a
Tree-sitter call graph over this repository. Rejected as the primary source
for the reasons above. It stays useful for reporting the unwired case, where
no entry point reaches the implementation at all and there is no run to
observe.

Cost: this runs the bound tests a second time, in isolation, under coverage.
That is slower than reading one whole-suite coverage file. It is also the only
way to attribute execution to a specific test rather than to the suite.

### A project declares entry points in a file beside its specs

Entry points live in a declaration file under `openspec/`, listing the
functions or modules that count as user-facing for that project.

Why: dod-guard runs against a command line tool, an MCP server, a game and a
user interface across the user's projects. No fixed rule identifies an entry
point across all of them. A project that declares none gets a report saying
nobody checked its integration. That is honest, and a pass would not be.

Alternative considered: infer entry points from the package manifest `bin` and
`main` fields. Rejected as too narrow. It would miss an MCP tool handler and
every screen in a user interface.

### Backfill drafts through an agent, and the confirmation gate is what makes that safe

Someone has to judge what shipped code means before it reads as a requirement.
The command gathers the evidence, an agent writes the prose, and the draft
stays unconfirmed until a human reads it.

This looks like the authorship problem the census exposed, and the difference
matters. A drafted requirement proves nothing on its own. It cannot make a
scenario count as covered, and `dod-guard cover` reports it as unconfirmed.
The agent proposes; the human decides. The old proof language let the agent do
both.

Alternative considered: draft requirements from test names by template.
Rejected. It produces a requirement that restates a test title, which
describes the test rather than the behavior.

### The command reports and never blocks

`dod-guard cover` exits 0 whenever it finished reading.

Why: on the day this lands, every repository fails it. A gate that everyone
must skip teaches people to skip gates. The report earns a blocking mode later,
once a baseline exists and can ratchet, the same way the four existing quality
ratchets work.

## Risks / Trade-offs

- Running bound tests a second time under coverage doubles their cost -> Only
  the tests bound to the change's scenarios re-run, not the whole suite. A
  change touches a handful of scenarios, not all 27 specs.

- The agent that writes a test also writes its marker -> The marker only claims
  which scenario the test aims at. It cannot claim the test passed. It cannot
  claim the entry point ran. Both of those come from the run.

- Reachability through an entry point still does not prove a human can use the
  feature -> True, and the spec says so. It rules out the specific failure the
  user named, where a feature has no path from the surface at all. A screen
  that renders but reads badly is not something this measures.

- Declaring entry points is manual work a project may skip -> The report names
  it as unchecked rather than passing it. A project that declares nothing
  learns nothing, which is the correct outcome and visible in the output.

- `packages/dod-guard/package.json` has a `coverage` script whose
  `--include="src/*.ts"` matches nothing, the failure CLAUDE.md describes for
  the old uniform gate -> Out of scope here. Noted so the coverage work does
  not copy that pattern.

## Migration Plan

Nothing to migrate. This change adds two commands beside the existing `check`
and `trace`, and removes nothing. A project that adopts neither command keeps
working as it does today.

Rollback is deleting the two subcommands and the report script. No stored data
changes format, and no existing document is rewritten.

## Open Questions

- Which reporter format to read from `node --test`. The choice affects only the
  reader module and not the specs, the approach, or the task list.
- Whether the entry point declaration lives in one file per repository or one
  per spec group. Both satisfy every scenario in the spec.
