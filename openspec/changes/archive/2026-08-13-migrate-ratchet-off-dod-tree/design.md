## Context

See `proposal.md` - Why. `/step-by-step` already migrated the same class of
problem: it reads `.step-session/steps.json` and `progress.log`, runs each
step's own `verify_cmd`, and closes with `dod-guard trace` then
`openspec archive --yes`. `ratchet/SKILL.md` still assumes the DoD-tree MCP
tools exist and a `dod-guard check --dod-id=... --node-path=...` CLI command
exists. Neither does.

## Goals / Non-Goals

**Goals:**
- Give `/ratchet` a loop that runs against real commands: `dod-guard steps`,
  `dod-guard cover`, `dod-guard trace`, `openspec archive`.
- Keep everything about ratchet that never depended on the DoD-tree engine:
  the `/loop` + `ScheduleWakeup` iteration mechanism, the evomcp/gitevo
  checkpoint integration, the 3-repair-attempt cap, the missing-server
  fallback table.

**Non-Goals:**
- Rebuilding a subtree-scoped check. A sub-problem is one `steps.json` step;
  its scoped check is that step's own `verify_cmd`. No grouping mechanism is
  introduced.
- Restoring STUCK detection, `dod_amend`, or the draft-leaf/`MANUAL:`
  concretize step. `steps.json`'s `manual_required` already covers the
  human-judgment case; the repair-attempt cap already covers stuck-detection.

## Decisions

**Sub-problem granularity: one `steps.json` step.** The alternative
(grouping several steps under one coarser sub-problem) would need a new
grouping concept `steps.json` does not have. Matching step-by-step's
granularity means ratchet can reuse `deps`-based ordering unchanged and
needs no new file format.

**Regression check: `dod-guard cover <change-id>`, not a re-run of every
prior `verify_cmd`.** `cover` already reports per-scenario outcome
(`covered-and-integrated`, `covered-but-not-integrated`, `unwired`,
`failed`, `improved`) against the coverage-gate baseline. Re-running every
prior step's `verify_cmd` by hand would duplicate that report without the
baseline comparison, and would grow linearly with run length.

**Escalation: the existing repair-attempt cap only.** The old STUCK signal
came from `dod_amend`'s own amend-count tracking, which has no equivalent
in `cover`/`steps`. Ratchet already caps repairs at 3 attempts per
sub-problem in its iteration prompt; that cap becomes the only escalation
trigger, unchanged in mechanism, just no longer backed by a second signal
from the DoD tools.

**New edge cases: spec delta + `tasks.md` + re-run `dod-guard steps`.**
This is the same authoring path `/interview` already uses to put a scenario
into a change, so ratchet gains no second way to add a proof.

## Risks / Trade-offs

- [Risk] Dropping STUCK detection removes the one signal that used to catch
  "amended the same proof three times, something is structurally wrong."
  -> Mitigation: the repair-attempt cap already stops the loop at the same
  point (3 failed attempts); the report to the user at that point already
  names the failing command and the approaches tried, so the same
  information reaches the user, just without a separate label.
- [Risk] Rewriting a widely-used skill file risks breaking a run that is
  mid-flight against the old format. -> Mitigation: `.step-session/` is
  gitignored and per-checkout; no in-flight ratchet session exists in this
  repo's tracked state.

## Migration Plan

Rewrite `ratchet/SKILL.md` directly; no phased rollout or flag. Fix the
three dependent files' example commands in the same change. No code, no
schema, no data migration involved.
