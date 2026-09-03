# Add /opsx-continue: advance a change from proposal to implementable

## Why

Two shipped skills tell the user to run `/opsx:continue`, and no such skill
exists. `opsx-update` refuses to create missing artifacts ("Do not advance the
build frontier: no new artifacts... that is `/opsx:continue`'s job") and
`opsx-apply` points at it the same way. So a change that holds only a
`proposal.md` has no skill that carries it forward. The only paths that write
specs, design, and tasks are `opsx-propose` and `opsx-quick`, and both create
the change themselves.

Large work also cannot be planned honestly in one pass. The task breakdown for
step five is guesswork until steps one through four are built. Today the only
options are to invent that detail up front or to leave it out entirely.

## What Changes

- **New skill `/opsx-continue`**: creates a change's missing planning artifacts
  in schema build order, starting from whatever already exists. Re-invocable.
- **Wave planning in `tasks.md`**: the skill writes every `## N. Group` heading
  up front as the coarse plan, and expands `- [ ]` checkboxes only for the wave
  being worked now. Later groups stay heading-only until a re-invocation expands
  them with what implementation has since taught us. This uses the existing
  two-level `tasks.md` structure and introduces no new plan format.
- **BREAKING for archive: `dod-guard cover <change-id>` gains a plan-completeness
  check.** A numbered group heading with no checkbox under it means the plan is
  not fully expanded, so the change is not done. `cover` reports those groups and
  exits with a new distinct code. Every archiving skill already runs `cover`
  before `openspec archive`, so this refuses the archive at the existing gate.
- **Rewire the dangling references**: `opsx-update` and `opsx-apply` stop
  describing `/opsx:continue` as an external workflow that "may not be installed"
  and point at the real skill.
- Register the skill: both marketplace manifests, `plugin.json`, both CLAUDE.md
  skill tables, and the three "Ships 28 skills" descriptions, which become 29.

### Why the gate is not already covered

The coverage ratchet does not catch an unexpanded wave. `coverage-gate-baseline.json`
adopts a scenario it has never seen at whatever outcome `cover` finds. Every
scenario in a new change is unseen, so a change whose later waves are entirely
unwired adopts at `unwired` and exits 0. Nothing today blocks archiving a
half-planned change. The wave workflow makes that state common rather than rare,
which is why it needs its own check.

## Capabilities

### New Capabilities

- `dod-guard/opsx-continue` - creating a change's missing planning artifacts in
  build order, and the wave discipline that expands one group at a time.

### Modified Capabilities

- `dod-guard/coverage-gate` - `cover` reads the change's `tasks.md` and refuses a
  change whose numbered groups are not expanded into checkboxes. Existing
  `bound`/`unwired` reporting and the ratchet are untouched, so this is an ADDED
  requirement rather than a change to one.

## Impact

- **New**: `packages/dod-guard/skills/opsx-continue/SKILL.md`
- **Code**: `packages/dod-guard/src/openspec/tasks-parser.ts` gains group parsing;
  `packages/dod-guard/src/cover/run.ts` and `cli.ts` gain the check and its exit
  code. Both need matching `*.test.ts` or the test-presence ratchet fails.
- **Skills**: `opsx-update`, `opsx-apply` reference rewiring.
- **Manifests and docs**: `packages/dod-guard/.claude-plugin/marketplace.json`,
  `packages/dod-guard/.claude-plugin/plugin.json`, root
  `.claude-plugin/marketplace.json`, root `CLAUDE.md`,
  `packages/dod-guard/CLAUDE.md`.
- **Baselines**: the quality and coverage baselines move when the new source
  files land, and must be rebaselined in the same commit.
- **Not touched**: `packages/dod-guard/package.json` version. A version bump on
  master publishes with no opt-out, so it stays out of this change.
