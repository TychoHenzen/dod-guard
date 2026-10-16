---
name: goal-sdlc
description: Work through the linked GitHub Project queue continuously, one parent PBI at a time, by running the existing lifecycle skills for each item until no eligible work remains.
---

# Goal SDLC

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the active plugin root.

Each stage follows its own skill; when this file and an owning skill differ, the
owning skill wins. Under `/goal`, also read and apply `standards/goal-stop.md`.

## Owners

| Owner | Runs when | Owns |
|---|---|---|
| [dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md) | the parent has Status Backlog, or Todo or In Progress after `step-plan-missing` | refinement, functional slices, review lenses, step plans, Todo readiness |
| [dod-guard:next-ticket](../next-ticket/SKILL.md) | the parent has Status Todo with step plans, or In Progress with no pushed handoff | the branch, implementation, validation, acceptance matrix, preflight checkpoint, pushed handoff |
| [dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md) | the parent has Status In Progress, a pushed handoff, and no converged draft pull request | the draft pull request and its convergence |
| [dod-guard:review-pr](../review-pr/SKILL.md) | the parent has a converged draft pull request and no review | the one code review |
| [dod-guard:fix-pr-review](../fix-pr-review/SKILL.md) | the parent has a review with unresolved findings | review remediation |
| [dod-guard:complete-pr](../complete-pr/SKILL.md) | every finding of the parent's pull request is fixed or declined | the ready transition, guarded merge, Project finalization, branch cleanup |
| [dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md) | work has no issue yet, or today's friction log is missing | new Backlog issues |

This skill owns only queue selection, sequencing, delegation, the friction log,
and the stop decision. It never writes issue, Project, branch, or pull request
state itself: closures run through the closure helper's `apply`.

## Loop

Repeat until the stop condition holds:

1. **Resume before selecting.** A dirty tree or in-progress branch usually means
   a delivery is underway: match its paths, branch, issue, children, and pull
   request, and resume it at its latest checkpoint. When nothing matches,
   capture the work with `dod-guard:add-backlog-idea`, refine it, and resume it. Never
   discard, stash, or fold it into an unrelated PBI.
2. **Clean up, then select one parent.** In `../complete-pr/scripts`, build the
   closure snapshot that `standards/project-workflow.md` defines with
   `node closure.mjs snapshot --repository=<owner/name> --output=<file>`. If
   snapshot exits non-zero, stop and report its error; never plan on an older
   file. Then run `node closure.mjs plan --snapshot=<file>`, report each close,
   hold, and `unverified-closed` entry with reasons, delegate planned closes and
   status repairs to `dod-guard:complete-pr`'s "Close delivered issues for goal-sdlc"
   section, as one write-capable stage, and reread. Run `closure.mjs annotate` on
   the snapshot, which takes `activeCheckpoint` and `trustedHeadSha` from the
   completion records and leaves every relation as read, then in this skill's
   directory pass its output to `node scripts/select-next.mjs --snapshot=<file>`.
   Keyed by `owner/name#number`, it holds any group with missing, stale,
   conflicting, or cross-repository evidence, selects nothing when the snapshot
   cannot be classified, and returns the first eligible group: In Progress parents
   first (one with an open pull request ahead of one without), then Todo, then
   Backlog, each in Project order. Report holds; `queueState: held` is not exhaustion.
3. **Run the lifecycle for that parent.** In the order of
   [dod-guard:quick-pbi](../quick-pbi/SKILL.md) steps 2 to 6, run the owner whose
   "Runs when" condition the parent meets, as the Delegation table says. When
   `dod-guard:next-ticket` stops with `step-plan-missing`, run
   `dod-guard:refine-backlog-item` on the parent, then `dod-guard:next-ticket`
   again. When refinement needs a user answer, leave the parent in Backlog with
   the questions recorded and move on to another parent.
4. **Read back and continue.** When `dod-guard:complete-pr` returns
   `conflict-triaged`, go to `dod-guard:submit-draft-pr` for the new head, not to
   the completion owner.
   Otherwise read the parent and child statuses. When any is not Done, return
   to the completion owner before selecting again. Otherwise go back to step 1.

Process exactly one parent at a time, in the current checkout, on one branch
and one pull request. Never create or use a Git worktree.

## Delegation

The main thread sequences stages and checks results; bounded subagents do the
context-heavy work. Each stage runs in one fresh subagent as one step of
[dod-guard:step-by-step](../step-by-step/SKILL.md), which owns the checkpoint,
proof, commit, and repair rules. A stage's split rows are dispatched by its
owner, as `standards/model-routing.md` says. Each row runs at this tier, on this
agent, and runs exactly what its last column names:

| Stage | Tier | Agent | Runs |
|---|---|---|---|
| Queue snapshot read | cheap | `dod-guard:read-cheap` | Follow Loop step 2 of this skill, but run only its `closure.mjs` and `select-next.mjs` commands and return their output; the close delegation stays with this thread |
| Refinement: owner thread (dispatch, verify, labels, step plans, Todo) | standard | `dod-guard:stage-standard` | Skill `dod-guard:refine-backlog-item <issue>` |
| Refinement: plan research questions | standard | `dod-guard:read-standard` | Follow "Research and discovery triage" in `dod-guard:refine-backlog-item` |
| Refinement: investigate code, callers, and tests | cheap | `dod-guard:read-cheap` | Follow "Research and discovery triage" in `dod-guard:refine-backlog-item` |
| Refinement: decide classification and criteria | standard | `dod-guard:read-standard` | Follow "Research and discovery triage" in `dod-guard:refine-backlog-item` |
| `dod-guard:next-ticket`: owner thread (start ticket, matrix, preflight, handoff) | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:next-ticket <issue>` |
| `dod-guard:next-ticket`: implement one task from its step plan | cheap | `dod-guard:stage-cheap` | Follow the task's `## Step plan: <task-id>` comment, saved unchanged to a scratch file |
| `dod-guard:next-ticket`: run validations and regenerate artifacts | cheap | `dod-guard:stage-cheap` | Follow the validation commands of that step plan |
| `dod-guard:submit-draft-pr` | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:submit-draft-pr <issue>` |
| `dod-guard:review-pr`: owner thread (scripts, dispatch, citation checks, build, post) | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:review-pr <pull-request>` |
| `dod-guard:review-pr`: plan | standard | `dod-guard:read-standard` | Follow step 5, "Plan", in `dod-guard:review-pr` |
| `dod-guard:review-pr`: investigate | cheap | `dod-guard:read-cheap` | Follow step 5, "Investigate", in `dod-guard:review-pr` |
| `dod-guard:review-pr`: judge and merge pass | standard | `dod-guard:review-pr-feature`, `dod-guard:review-pr-design`, `dod-guard:review-pr-reliability`, `dod-guard:review-pr-hygiene`; the merge pass on `dod-guard:read-standard` | Follow step 5, "Judge" and "Merge", in `dod-guard:review-pr` |
| `dod-guard:fix-pr-review`: owner thread (revalidate, classify, plan fixes, verify, reply) | standard | `dod-guard:stage-standard` | Skill `dod-guard:fix-pr-review <pull-request> <finding-ids>` |
| `dod-guard:fix-pr-review`: apply a written per-finding fix | cheap | `dod-guard:stage-cheap` | Follow the owner's per-finding fix plan |
| `dod-guard:complete-pr`: guarded merge and Project finalization | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:complete-pr <pull-request>` |
| `dod-guard:complete-pr`: close delivered issues (Loop step 2) | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:complete-pr`, section "Close delivered issues for goal-sdlc" only |
| Merge conflict triage: owner thread, plan, and judge | standard | `dod-guard:stage-standard`, `dod-guard:read-standard` | Follow `standards/conflict-triage.md` |
| Merge conflict triage: investigate and apply | cheap | `dod-guard:read-cheap`, `dod-guard:stage-cheap` | Follow `standards/conflict-triage.md` |
| `dod-guard:add-backlog-idea`, including the friction log | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:add-backlog-idea <request>` |

Every dispatch carries the brief that "Stage brief" in
`standards/model-routing.md` defines, built from the last column, and nothing
else: write no template, copy, summary, or rules file of a skill. A
`dod-guard:complete-pr` run on the cheap model stops at `merge_conflict`, and
this thread then runs the conflict triage as its own stage, as
`standards/conflict-triage.md` says. A rerun of any row, such as a refreshed
handoff or a second `dod-guard:complete-pr`, takes that row's tier.

Dispatch each row as `standards/model-routing.md` says: pass its model and
effort to the Agent call in Claude Code, or use the registered tier agent in
Codex, and name the stage, tier, model, and effort in the progress message. A
user's model or effort override is applied and recorded as that standard says.
Verify each stage's output as that standard says for its tier, and read back the
commit of any stage that changed tracked files before the next stage starts. No
row starts on the strong tier: a stage that fails its check climbs one tier
under "Escalation" in that standard. A stage
report that names a live child, a pending named proof, or a still-applied
temporary probe is incomplete: resume the same stage at its current checkpoint,
and do not advance or launch a replacement stage. Use the Agent tool in Claude
Code and spawned agents in Codex. User-visible tasks or threads
(`create_thread`, `fork_thread`, `send_message_to_thread`,
`codex://threads/...`) are not subagents. Retire a subagent before its context
passes about 100,000 tokens and brief a fresh one with the compact checkpoint.

Before claiming a parent, check for another active goal or agent run on the
same repository, parent, branch, and stage. When one exists, do not mutate
anything; wait for it, or fail closed and name it as the owner if its head or
handoff disagrees with yours. The pull request, issues, and handoff comments
are the only ownership record; do not create a lock file or local ledger.

## Blockers

Follow the failure-recovery rule in `standards/working-defaults.md`, including
`dod-guard:codex-advisor` for a blocker that survives local triage. A blocked parent is
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
  none exists, through `dod-guard:add-backlog-idea`, with entries under `## Entries`.
- Each entry is a `###` section: what happened (error, tool, stage, PBI, SHA),
  the workaround, the durable fix (files and change), and how to verify it.
- Re-read the issue before appending, and read it back after writing.

The queue holds today's log while it collects entries; from the next day it is
ordinary Backlog work. When a dod-guard skill is wrong, log the defect and its
source-repository fix here and continue with the workaround.

## Reporting

Progress messages have no fixed format. The final report says how many parent
and child PBIs reached Done, counting only the target repository's parent and
child PBIs whose Project status reads Done, as select-next's `counts` report
them, even when the linked Project spans several repositories.

When every remaining parent is blocked, send one short message that starts
with `Blocked:` and assumes no prior context: the repository, PBI
number and title, what blocks it, the evidence, what was tried, and the one
decision or action needed. Use plain words instead of workflow terms.

## Stop condition

Stop only when no eligible parent remains after verified holds, a user stop condition is met, or the user ends the run,
or every remaining parent stays blocked by the same external cause across three evidence-backed attempts.
An empty Todo column with a non-empty Backlog is not an empty queue; finishing one PBI is not a reason to stop.
An empty selection from selector defects or missing evidence is not completion.
Recheck the checkout for in-progress work before reporting an exhausted queue.
