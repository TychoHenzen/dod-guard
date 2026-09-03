## ADDED Requirements

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
