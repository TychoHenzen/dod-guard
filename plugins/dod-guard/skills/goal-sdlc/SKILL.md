---
name: goal-sdlc
description: Work through the linked GitHub Project queue continuously, one parent PBI at a time, by running the existing lifecycle skills for each item until no eligible work remains.
---

# Goal SDLC

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the active plugin root.

This skill is a queue loop. It picks the next parent PBI and runs the existing
lifecycle skills on it, then picks the next one. It does not restate their
rules: each stage follows its own skill, and when this file and an owning skill
differ, the owning skill wins. Run it directly, or as the plan for a Codex
`/goal` run; in Codex the built-in command owns goal persistence and the final
stop decision.

## Owners

- [dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md): refinement,
  functional slices, review lenses, and Todo readiness.
- [dod-guard:next-ticket](../next-ticket/SKILL.md): the branch, implementation,
  validation, acceptance matrix, preflight checkpoint, and pushed handoff.
- [dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md): the draft pull
  request and its convergence before review.
- [dod-guard:review-pr](../review-pr/SKILL.md): the one code review.
- [dod-guard:fix-pr-review](../fix-pr-review/SKILL.md): remediation of review
  findings.
- [dod-guard:complete-pr](../complete-pr/SKILL.md): the ready transition,
  guarded merge, Project finalization, and branch cleanup.
- [dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md): new Backlog
  issues, including the daily friction log.

This skill owns only queue selection, sequencing, delegation, the friction log,
and the stop decision. It never writes issue, Project, branch, or pull request
state itself.

## Loop

Repeat until the stop condition holds:

1. **Resume before selecting.** Check the current checkout first. A dirty tree
   or in-progress branch usually means a delivery is already underway: match
   its paths, branch, issue, children, and pull request, and resume that
   delivery at its latest checkpoint. When nothing matches, capture the work
   with `/add-backlog-idea`, refine it, and resume it. Never discard, stash, or
   fold it into an unrelated PBI.
2. **Select one parent.** Read every Project page for this repository with the
   GitHub connector, together with each listed issue (with its parent and
   children) and each linked pull request. Save them as JSON and run
   `node scripts/select-next.mjs --snapshot=<file>` from this skill's
   directory. It is read-only. It groups children under their parent, holds
   any group with missing, stale, or conflicting evidence, excludes verified
   merged deliveries, holds today's friction log, and returns the first
   eligible group: In Progress parents first (one with an open pull request
   ahead of one without), then Todo, then Backlog, each in Project order. It
   needs each issue's `activeCheckpoint` and each pull request's
   `trustedHeadSha` to recognize a finished delivery; run it with no
   arguments for the full snapshot shape. Report each held group's reasons
   rather than guessing past them.
3. **Run the lifecycle for that parent.** Follow
   [dod-guard:quick-pbi](../quick-pbi/SKILL.md) steps 2 to 6, starting at the
   step the parent has reached: refine a Backlog parent, then `/next-ticket`,
   `/submit-draft-pr`, `/review-pr`, `/fix-pr-review` for any findings, and
   `/complete-pr`. When refinement needs an answer from the user, leave the
   parent in Backlog with the questions recorded and continue with another
   parent instead of waiting.
4. **Read back and continue.** After `/complete-pr` returns, read the parent
   and child statuses. When any is not Done, return to the completion owner
   before selecting again. Otherwise increment `PBIs completed: N` and go back
   to step 1.

Process exactly one parent at a time, in the current checkout, on one branch
and one pull request. Never create or use a Git worktree.

## Delegation

The main thread sequences stages and checks results; bounded subagents do the
context-heavy work. For each stage:

1. Give one fresh subagent the parent and child PBIs, branch and head, the
   stage it owns, and the evidence it must return. It edits only that scope.
2. Inspect what it returns, read back any external change, and run the named
   proof before moving on.
3. On failure, keep the checkpoint and repair the same stage, or record an
   external blocker before selecting another parent.

Use the Agent tool in Claude Code and spawned agents in Codex. User-visible
tasks or threads (`create_thread`, `fork_thread`, `send_message_to_thread`,
`codex://threads/...`) are not subagents. Retire a subagent before its context
passes about 100,000 tokens and brief a fresh one with the compact checkpoint.

Before claiming a parent, check for another active goal or agent run on the
same repository, parent, branch, and stage. When one exists, do not mutate
anything; wait for it, or fail closed and name it as the owner if its head or
handoff disagrees with yours. The pull request, issues, and handoff comments
are the only ownership record; do not create a lock file or local ledger.

## Blockers

Follow the failure-recovery rule in `standards/working-defaults.md`, including
`/codex-advisor` for a blocker that survives local triage. A blocked parent is
not a reason to stop: record what is blocking it, what was tried, and what
would unblock it on the issue, preserve its branch and checkpoint, and select
the next eligible parent.

When a provider reports a rate limit, record the reset time, work on other
parents, and retry the blocked call once after the reset.

## Friction log

Record every tool failure, skill defect, or workflow friction in one issue per
day titled exactly `Friction log YYYY-MM-DD` with today's local date, even when
the incident was recovered:

- If today's log already has an entry for the same friction, add the
  occurrence to it. Otherwise, if one search finds an open PBI that already
  owns the fix, comment there. Otherwise append a new entry.
- Find today's log with one search for that exact title. Create it only when
  none exists, through `/add-backlog-idea`, with entries under `## Entries`.
- Each entry is a `###` section: what happened (error, tool, stage, PBI, SHA),
  the workaround, the durable fix (files and change), and how to verify it.
- Re-read the issue before appending, and read it back after writing.

The queue holds today's log while it collects entries; from the next day it is
ordinary Backlog work. When a dod-guard skill is wrong, log the defect and its
source-repository fix here and continue with the workaround.

## Reporting

Prefix progress messages with the local `[HH:MM]` time and carry
`PBIs completed: N`, counting only parents merged with their Project status
read back as Done.

When every remaining parent is blocked, send one short message that starts
with `Blocked:` and assumes no prior context: the repository, PBI number and
title, what blocks it, the evidence, what was tried, and the one decision or
action needed. Use plain words instead of workflow terms.

## Stop condition

Stop only when no eligible parent remains, the user ends the run, or every
remaining parent has stayed blocked by the same external cause across three
evidence-backed attempts. An empty Todo column with a non-empty Backlog is not
an empty queue, and finishing one PBI is not a reason to stop. Before
reporting an empty queue, recheck the checkout for in-progress work.
