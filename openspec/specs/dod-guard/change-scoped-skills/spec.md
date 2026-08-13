# dod-guard/change-scoped-skills Specification

## Purpose
Puts the four skills that ran outside OpenSpec onto a change id: `/ratchet`,
`/adversarial-workflow`, `/blind-rewrite`, and `/tighten`. Each one writes its
artifacts to that change and closes on the same coverage-then-archive gate the
executor uses.
## Requirements
### Requirement: every executing skill takes a change id

`/ratchet`, `/adversarial-workflow`, `/blind-rewrite`, and `/tighten` SHALL each
take a change id and scope every read and write to it, rather than starting
from no identifier at all.

#### Scenario: A skill starts a run
- **WHEN** any of the four skills starts
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=change-scoped` exits
  0, having found a change id in each skill's starting inputs

### Requirement: the closing gate is shared

`/ratchet` and `/adversarial-workflow` SHALL close a green run with
`dod-guard cover <change-id>` reporting zero regressions against the ratchet
baseline, followed by `openspec archive <change-id> --yes`, the same order
`/step-by-step` uses. A regression SHALL stop the run before archiving.

#### Scenario: A ratchet run reaches its finish
- **WHEN** every scenario the change touches is covered-and-integrated or
  unchanged from the baseline
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=closing-gate` exits
  0, having found `dod-guard cover` before `openspec archive` in both skills

#### Scenario: A scenario regresses
- **WHEN** `dod-guard cover <change-id>` reports a scenario the baseline marked
  covered as now unwired or covered-but-not-integrated
- **THEN** the skill reports the regression and does not archive

### Requirement: no skill claims interview builds a DoD

`/ratchet` and `/adversarial-workflow` SHALL describe `/interview` as writing
scenarios into an OpenSpec spec delta, not as generating a DoD.

#### Scenario: A skill describes where its scenarios came from
- **WHEN** either skill explains its starting point
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=no-legacy-fallback`
  exits 0

### Requirement: the rewrite contract is a spec delta

`/blind-rewrite` SHALL write the contract for a code target as the change's
spec delta under `openspec/changes/<id>/specs/`, before deletion rather than
after the rewrite. `.blind/` SHALL hold only the quarantined original.

#### Scenario: A code target is contracted
- **WHEN** the skill extracts a contract for a shape A, B, or C target
- **THEN** the contract lands under `openspec/changes/<id>/specs/` and `.blind/`
  holds no contract file

#### Scenario: The contract uses OpenSpec's own keywords
- **WHEN** the skill states which RFC 2119 keyword a requirement takes
- **THEN** it names SHALL or MUST and avoids should and may, matching the
  `specs` artifact instruction

### Requirement: a tighten target is a change

`/tighten` SHALL open a change for each target it picks. `.tighten/ledger.json`
SHALL remain the scanner queue, and a target SHALL count as accepted when its
change archives rather than when the ledger says so.

#### Scenario: The loop picks a target
- **WHEN** `pick-target.mjs` returns a target
- **THEN** the skill opens a change for it before any rewrite starts

#### Scenario: A target is accepted
- **WHEN** a target's `dod-guard cover` run shows zero regressions
- **THEN** its change archives, and the ledger records the outcome without
  defining a second completion vocabulary

### Requirement: ratchet's loop runs on cover and steps, not the DoD-tree engine

`/ratchet` SHALL check each sub-problem with that step's own `verify_cmd`
from `steps.json`, and SHALL re-verify the whole change with
`dod-guard cover <change-id>` after every sub-problem, instead of the
DoD-tree MCP tools or a `dod-guard check --dod-id=...` command.

#### Scenario: A sub-problem is checked
- **WHEN** a ratchet iteration verifies one sub-problem
- **THEN** it runs that step's `verify_cmd` from `steps.json` as a plain
  shell command

#### Scenario: The whole change is re-verified
- **WHEN** a ratchet iteration finishes a sub-problem
- **THEN** it runs `dod-guard cover <change-id>` and stops before the next
  sub-problem if any scenario regressed from its prior outcome

### Requirement: no skill or agent references the removed DoD-tree tools

`/ratchet`, `/cheap-step`, `evomcp/skills/cascade`, and
`evomcp/agents/spec-writer` SHALL NOT reference `dod_tree`, `dod_refine`,
`dod_status`, `dod_list`, `dod_add_node`, `dod_amend`, or a
`dod-guard check --dod-id=` command.

#### Scenario: A grep for the removed tools finds nothing
- **WHEN** the four files are scanned for the removed DoD-tree tool names
  and the dead `check --dod-id=` command
- **THEN** `grep -rn "dod_tree\|dod_refine\|dod_status\|dod_list\|dod_add_node\|dod_amend\|dod-guard check" packages/dod-guard/skills/ratchet/SKILL.md packages/dod-guard/skills/cheap-step/SKILL.md packages/evomcp/skills/cascade/SKILL.md packages/evomcp/agents/spec-writer.md` exits 1

