## Why

`/dod-guard:ratchet`'s per-sub-problem loop still calls the DoD-tree MCP tools
(`dod_tree`, `dod_refine`, `dod_status`, `dod_list`, `dod_add_node`,
`dod_amend`) and a `dod-guard check --dod-id=... --node-path=...` CLI command.
`packages/dod-guard/src/index.ts` registers zero MCP tools now, and
`cli.ts` only implements `cover` and `steps`. A ratchet run fails on its
first tool call. Three other files repeat the same dead example command:
`cheap-step/SKILL.md`, `evomcp/skills/cascade/SKILL.md`, and
`evomcp/agents/spec-writer.md`.

## What Changes

- Rewrite `ratchet/SKILL.md`'s Setup, iteration prompt, and Finish sections
  to run on `dod-guard cover <change-id>` and `dod-guard steps <change-id>`,
  the same engine `/step-by-step` already uses, instead of the DoD-tree
  MCP tools.
- **BREAKING**: drop the STUCK/`dod_amend` escalation path and the in-loop
  "concretize a draft leaf" step. Neither has a `cover`/`steps` equivalent;
  the existing 3-repair-attempt cap becomes the sole escalation trigger.
- Replace `dod_add_node` (adding a regression proof at Finish or mid-run)
  with appending a Requirement/Scenario to the change's spec delta plus a
  `tasks.md` item, then re-running `dod-guard steps <change-id>`.
- Fix the stale `dod-guard check --dod-id=...` example command in
  `cheap-step/SKILL.md`, `evomcp/skills/cascade/SKILL.md`, and
  `evomcp/agents/spec-writer.md`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dod-guard/change-scoped-skills`: `/ratchet`'s per-sub-problem loop
  mechanics (scoped check, regression check, escalation, new-proof
  authoring) move from the DoD-tree MCP engine onto `cover`/`steps`.

## Impact

- `packages/dod-guard/skills/ratchet/SKILL.md` (rewritten)
- `packages/dod-guard/skills/cheap-step/SKILL.md` (example command fix)
- `packages/evomcp/skills/cascade/SKILL.md` (example command fix)
- `packages/evomcp/agents/spec-writer.md` (example command fix)
- No code changes; no change to `dod-guard`'s CLI, `cover`/`steps`
  implementation, or the evomcp/gitevo integration.
