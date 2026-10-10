---
name: goal-sdlc
description: Work through the linked GitHub Project queue continuously, one parent PBI at a time, by running the existing lifecycle skills for each item until no eligible work remains.
---

# Goal SDLC

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the active plugin root.

Each stage follows its own skill; when this file and an owning skill differ, the
owning skill wins. For a Codex `/goal` run, `/goal` owns persistence and stop.

## Owners

- [dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md): refinement,
  functional slices, review lenses, and Todo readiness.
- [dod-guard:next-ticket](../next-ticket/SKILL.md): the branch, implementation,
  validation, acceptance matrix, preflight checkpoint, and pushed handoff.
- [dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md): the draft pull
  request and its convergence before review.
- [dod-guard:review-pr](../review-pr/SKILL.md): the one code review.
- [dod-guard:fix-pr-review](../fix-pr-review/SKILL.md): review remediation.
- [dod-guard:complete-pr](../complete-pr/SKILL.md): the ready transition,
  guarded merge, Project finalization, and branch cleanup.
- [dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md): new Backlog
  issues, including the daily friction log.

This skill owns only queue selection, sequencing, delegation, the friction log,
and the stop decision. It never writes issue, Project, branch, or pull request
state itself: closures run through the closure helper's `apply`.

## Loop

Repeat until the stop condition holds:

1. **Resume before selecting.** A dirty tree or in-progress branch usually means
   a delivery is underway: match its paths, branch, issue, children, and pull
   request, and resume it at its latest checkpoint. When nothing matches,
   capture the work with `/add-backlog-idea`, refine it, and resume it. Never
   discard, stash, or fold it into an unrelated PBI.
2. **Clean up, then select one parent.** In `../complete-pr/scripts`, build the
   closure snapshot that `standards/project-workflow.md` defines with
   `node closure.mjs snapshot --repository=<owner/name> --output=<file>`. If
   snapshot exits non-zero, stop and report its error; never plan on an older
   file. Then run `node closure.mjs plan --snapshot=<file>`, report each close,
   hold, and `unverified-closed` entry with reasons, delegate planned closes and
   status repairs to `/complete-pr`'s "Close delivered issues for goal-sdlc"
   section, as one write-capable stage, and reread. Run `closure.mjs annotate` on
   the snapshot, which takes `activeCheckpoint` and `trustedHeadSha` from the
   completion records and leaves every relation as read, then in this skill's
   directory pass its output to `node scripts/select-next.mjs --snapshot=<file>`.
   Keyed by `owner/name#number`, it holds any group with missing, stale,
   conflicting, or cross-repository evidence, selects nothing when the snapshot
   cannot be classified, and returns the first eligible group: In Progress parents
   first (one with an open pull request ahead of one without), then Todo, then
   Backlog, each in Project order. Report held reasons; never guess past them.
3. **Run the lifecycle for that parent.** Follow
   [dod-guard:quick-pbi](../quick-pbi/SKILL.md) steps 2 to 6 from the step the
   parent has reached. When refinement needs a user answer, leave the parent in
   Backlog with the questions recorded and move on to another parent.
4. **Read back and continue.** When `/complete-pr` returns `conflict-triaged`,
   go to `/submit-draft-pr` for the new head, not to the completion owner.
   Otherwise read the parent and child statuses. When any is not Done, return
   to the completion owner before selecting again. Otherwise update `PBIs
   completed: P parent / C child` and go back to step 1.

Process exactly one parent at a time, in the current checkout, on one branch
and one pull request. Never create or use a Git worktree.

## Delegation

The main thread sequences stages and checks results; bounded subagents do the
context-heavy work. Each stage runs in one fresh subagent as one step of
[dod-guard:step-by-step](../step-by-step/SKILL.md), which owns the checkpoint,
proof, commit, and repair rules. A stage's split rows are dispatched by its
owner, as `standards/model-routing.md` says. Each row runs at this tier:

| Stage | Tier | Effort |
|---|---|---|
| Queue snapshot read | cheap | `max` |
| Refinement: plan research questions | strong | `medium` |
| Refinement: investigate code, callers, and tests | cheap | `max` |
| Refinement: decide classification and criteria | strong | `medium` |
| `/next-ticket`: implement one task | strong | `medium` |
| `/next-ticket`: run validations and regenerate artifacts | cheap | `max` |
| `/submit-draft-pr` | strong | `medium` |
| `/review-pr`: plan | strong | `medium` |
| `/review-pr`: investigate | cheap | `max` |
| `/review-pr`: judge | strong | `medium` |
| `/fix-pr-review` | strong | `medium` |
| `/complete-pr`: guarded merge and Project finalization | strong | `medium` |
| `/add-backlog-idea`, including the friction log | strong | `medium` |
| Merge conflict on a PBI head | per `standards/conflict-triage.md` | per `standards/conflict-triage.md`; unresolvable conflicts stop and report, and a verified push re-enters at `/submit-draft-pr` |

Dispatch each row as `standards/model-routing.md` says: pass its model and
effort to the Agent call in Claude Code, or use the registered tier agent in
Codex, and name the stage, tier, model, and effort in the progress message. A
user's model or effort override is applied and recorded as that standard says.
Verify cheap-tier output before anything relies on it, and read back the
commit of any stage that changed tracked files before the next stage starts.

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
the next eligible parent. When a provider reports a rate limit, record the
reset time, work on other parents, and retry the blocked call once after it.

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

Start every progress message with the local `[HH:MM]` time from the clock.
Every progress message and the final report carry `PBIs completed: P parent /
C child`, counting parent and child PBIs whose Project status reads Done.

When every remaining parent is blocked, send one short message that starts
with `[HH:MM] Blocked:` and assumes no prior context: the repository, PBI
number and title, what blocks it, the evidence, what was tried, and the one
decision or action needed. Use plain words instead of workflow terms.

## Stop condition

Stop only when no eligible parent remains, the user ends the run, or every
remaining parent has stayed blocked by the same external cause across three
evidence-backed attempts. An empty Todo column with a non-empty Backlog is not
an empty queue, and finishing one PBI is not a reason to stop. Before
reporting an empty queue, recheck the checkout for in-progress work.
