---
name: goal-sdlc
description: Work through the linked GitHub Project queue continuously, one parent PBI at a time, by running the existing lifecycle skills for each item until no eligible work remains.
---

# Goal SDLC

Read and apply `standards/working-defaults.md` and `standards/github-request-discipline.md` from the active plugin root. Under `/goal`, also read and apply `standards/goal-stop.md`.

## Owners

Every parent meets exactly one owner below.

| Owner | Runs when | Owns |
|---|---|---|
| [dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md) | the parent has Status Backlog, or `dod-guard:next-ticket` stopped with `step-plan-missing` | refinement, functional slices, step plans, Todo readiness |
| [dod-guard:next-ticket](../next-ticket/SKILL.md) | the parent has Status Todo, or In Progress with no pushed handoff | branch, implementation, validation, acceptance matrix, preflight checkpoint, pushed handoff |
| [dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md) | the parent has Status In Progress, a pushed handoff, and no converged draft pull request | the draft pull request and its convergence |
| [dod-guard:review-pr](../review-pr/SKILL.md) | the parent has a converged draft pull request and no review | the one code review |
| [dod-guard:fix-pr-review](../fix-pr-review/SKILL.md) | the parent has a review with unresolved `BLOCKER` or `MAJOR` findings | review remediation |
| [dod-guard:complete-pr](../complete-pr/SKILL.md) | the parent's pull request has a review and no unresolved `BLOCKER` or `MAJOR` finding; `MINOR` notes never block | ready transition, guarded merge, Project finalization, branch cleanup |
| [dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md) | work has no issue yet, or today's friction log is missing | new Backlog issues |

Each stage follows its own skill; when this file and an owning skill differ, the owning skill wins. This skill owns only queue selection, sequencing, delegation, the friction log, and the stop decision. It never writes issue, Project, branch, or pull request state itself: closures run through the closure helper's `apply`.

## Loop

Repeat until the stop condition holds:

1. **Resume before selecting.** A dirty tree or an in-progress branch usually means a delivery is underway. Match its paths, branch, issue, children, and pull request, and carry on from the latest checkpoint. If none of them match, capture the work with `dod-guard:add-backlog-idea`, refine it, and then resume. Never discard or stash such work, and never fold it into an unrelated PBI.
2. **Clean up, then select one parent.** Work in `../complete-pr/scripts` first. First build the closure snapshot that `standards/project-workflow.md` defines with `node closure.mjs snapshot --repository=<owner/name> --output=<file>`. If snapshot exits non-zero, stop and report its error, and do not plan on an older file. Next, run `node closure.mjs plan --snapshot=<file>`, report each close, hold, and `unverified-closed` entry, and delegate planned closes and status repairs to the "Close delivered issues for goal-sdlc" section of `dod-guard:complete-pr` as one write-capable stage. Reread afterwards with a fresh snapshot. Run `closure.mjs annotate` on the snapshot, which takes `activeCheckpoint` and `trustedHeadSha` from the completion records and leaves every relation as read. Selection happens in this skill's directory: `node scripts/select-next.mjs --snapshot=<file>`. Keyed by `owner/name#number`, the selector holds any group with missing, stale, conflicting, or cross-repository evidence, and it selects nothing when the snapshot cannot be classified. Otherwise it picks In Progress parents first (a parent with an open pull request ahead of one without), then Todo, then Backlog, each in Project order. Report holds; `queueState: held` is not exhaustion.
3. **Run the lifecycle owner** that the parent's state calls for, following the order of [dod-guard:quick-pbi](../quick-pbi/SKILL.md) steps 2 to 6. When `dod-guard:next-ticket` stops with `step-plan-missing`, run `dod-guard:refine-backlog-item` on the parent, then `dod-guard:next-ticket` once more. If refinement cannot go on without a user answer, record the questions, leave the parent in Backlog, and move to another parent.
4. **Confirm the outcome.** When `dod-guard:complete-pr` returns `conflict-triaged`, go to `dod-guard:submit-draft-pr` for the new head, not to the completion owner. In every other case, read the statuses of the parent and its children. Any status short of Done sends the run back to the completion owner before it selects again. When all read Done, return to step 1.

Process exactly one parent at a time, in the current checkout, so that each run has a single branch and a single pull request. Never create or use a Git worktree.

## Delegation

The main thread sequences stages and checks results; bounded subagents do the context-heavy work. Each stage runs in one fresh subagent as one step of [dod-guard:step-by-step](../step-by-step/SKILL.md). A stage's split rows are dispatched by its owner thread. Each row runs at its tier, on its agent, and runs exactly what its last column names.

| Stage | Tier | Agent | Runs |
|---|---|---|---|
| Queue snapshot read | cheap | `dod-guard:read-cheap` | Follow Loop step 2 in `dod-guard:goal-sdlc`. This thread dispatches the row twice, and the close delegation stays with this thread: first to run only `closure.mjs snapshot` and `closure.mjs plan` and return the plan, then, after the closes, to run only a fresh `closure.mjs snapshot`, `closure.mjs annotate`, and `select-next.mjs` and return the selection |
| Refinement: owner thread (dispatch, verify, labels, step plans, Todo) | standard | `dod-guard:stage-standard` | Skill `dod-guard:refine-backlog-item <issue>` |
| Refinement: plan research questions | standard | `dod-guard:read-standard` | Follow "Research and discovery triage" in `dod-guard:refine-backlog-item` |
| Refinement: investigate code, callers, and tests | cheap | `dod-guard:read-cheap` | Follow "Research and discovery triage" in `dod-guard:refine-backlog-item` |
| Refinement: decide classification and criteria | standard | `dod-guard:read-standard` | Follow "Research and discovery triage" in `dod-guard:refine-backlog-item` |
| `dod-guard:next-ticket`: owner thread (start ticket, matrix, preflight, handoff) | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:next-ticket <issue>` |
| `dod-guard:next-ticket`: implement one task from its step plan | cheap | `dod-guard:stage-cheap` | Follow the step plan in <scratch file>. The file holds the task's `## Step plan: <task-id>` comment, saved unchanged |
| `dod-guard:next-ticket`: run validations and regenerate artifacts | cheap | `dod-guard:stage-cheap` | Follow the step plan in <scratch file>. Run only its validation commands |
| `dod-guard:submit-draft-pr` | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:submit-draft-pr <issue>` |
| `dod-guard:review-pr`: owner thread (scripts, dispatch, citation checks, build, post) | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:review-pr <pull-request>` |
| `dod-guard:review-pr`: plan | standard | `dod-guard:read-standard` | Follow step 5, "Plan", in `dod-guard:review-pr` |
| `dod-guard:review-pr`: investigate | cheap | `dod-guard:read-cheap` | Follow step 5, "Investigate", in `dod-guard:review-pr` |
| `dod-guard:review-pr`: judge and merge pass | standard | `dod-guard:review-pr-feature`, `dod-guard:review-pr-design`, `dod-guard:review-pr-reliability`, `dod-guard:review-pr-hygiene`; the merge pass on `dod-guard:read-standard` | Follow step 5, "Judge" and "Merge", in `dod-guard:review-pr` |
| `dod-guard:fix-pr-review`: owner thread (revalidate, classify, plan fixes, verify, reply) | standard | `dod-guard:stage-standard` | Skill `dod-guard:fix-pr-review <pull-request> <finding-ids>` |
| `dod-guard:fix-pr-review`: apply a written per-finding fix | cheap | `dod-guard:stage-cheap` | Follow the fix plan in <scratch file>. The file holds the owner's per-finding fix plan, saved unchanged |
| `dod-guard:complete-pr`: guarded merge and Project finalization | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:complete-pr <pull-request>` |
| `dod-guard:complete-pr`: close delivered issues (Loop step 2) | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:complete-pr`. Follow only its section "Close delivered issues for goal-sdlc" |
| Merge conflict triage: owner thread, plan, and judge | standard | `dod-guard:stage-standard`, `dod-guard:read-standard` | Follow `standards/conflict-triage.md` |
| Merge conflict triage: investigate and apply | cheap | `dod-guard:read-cheap`, `dod-guard:stage-cheap` | Follow `standards/conflict-triage.md` |
| `dod-guard:add-backlog-idea`, including the friction log | cheap | `dod-guard:stage-cheap-skill` | Skill `dod-guard:add-backlog-idea <request>` |

A stage report that names a live child, a pending named proof, or a still-applied temporary probe is incomplete: resume the same stage at its current checkpoint, and do not advance or launch a replacement stage.

Dispatch each row as `standards/model-routing.md` says. Under it, pass its model and effort to the Agent call in Claude Code, or use the registered tier agent in Codex. Also name the stage, tier, model, and effort in the progress message. The user's model or effort override is applied and recorded as that standard says. Every dispatch carries the brief that "Stage brief" in `standards/model-routing.md` defines, built from the last column, and nothing else: write no template, copy, summary, or rules file of a skill.

Verify each stage's output as that standard says for its tier, and read back the commit of any stage that changed tracked files before the next stage starts. No row starts on the strong tier: a stage that fails its check climbs one tier under "Escalation" in that standard. A rerun of any row, such as a refreshed handoff or a second `dod-guard:complete-pr`, takes that row's tier. A `dod-guard:complete-pr` run on the cheap model stops at `merge_conflict`, and this thread then runs the conflict triage as its own stage, as `standards/conflict-triage.md` says.

Tasks or threads that the user can see (`create_thread`, `fork_thread`, `send_message_to_thread`, `codex://threads/...`) are not subagents. Spawn work with the Agent tool in Claude Code and with spawned agents in Codex. A subagent whose context nears 100,000 tokens is retired, and a fresh one gets the compact checkpoint.

Before claiming a parent, look for another active goal or agent run on the same repository, parent, branch, and stage. If one exists, change nothing: wait, or fail closed and name that run as owner when heads or handoffs disagree. The pull request, issues, and handoff comments are the only ownership record, so do not create a lock file or local ledger.

## Blockers

A blocked parent is no reason to stop; move past it. Record the blocker, the attempts made, and what would unblock it on the issue, and keep the branch and checkpoint as they are. Then select the next eligible parent. A rate limit gets the reset time on record, work on other parents meanwhile, and one retry afterwards. The failure-recovery rule in `standards/working-defaults.md` governs the details. A blocker that survives local triage goes to `dod-guard:codex-advisor`.

## Friction log

Each day has one issue titled exactly `Friction log YYYY-MM-DD`, using today's local date. Anything that went wrong on the way counts, whether a tool failure, a skill defect, or plain workflow friction, even if the run recovered. Look the issue up with a single search for its exact title, and create it only if absent, through `dod-guard:add-backlog-idea`, with entries under the `## Entries` heading. The queue holds today's log while it collects entries; from the next day it is ordinary Backlog work.

- Re-read the issue before appending, and read it back after writing.

Place each finding by this order:

1. The same friction is already in today's log: add an occurrence to it.
2. One search turns up an open PBI that owns the fix: comment there.
3. Neither: append a new `###` section.

A new section gives what happened (error, tool, stage, PBI, SHA), the workaround, the durable fix (files and change), and how to verify that fix. When a dod-guard skill is itself wrong, log the defect and its source-repository fix here, in the daily log, then continue with the workaround.

## Reporting

Progress messages have no fixed format. The final report says how many parent and child PBIs reached Done, counting only the target repository's parent and child PBIs whose Project status reads Done, as select-next's `counts` report them, even when the linked Project spans several repositories.

If every remaining parent is blocked, send a single short message that starts with `Blocked:` and does not rely on earlier context. In plain words, not workflow terms, it gives the repository, the PBI number and title, what blocks it, the evidence, what was tried, and the one decision or action needed.

## Stop condition

The run ends when no eligible parent remains after verified holds, when a user stop condition is met or the user ends the run, or when every remaining parent is blocked by the same external cause across three evidence-backed attempts. Nothing else ends it. An empty Todo column with a non-empty Backlog is not an empty queue, and finishing one PBI is no reason to stop. An empty selection that comes from selector defects or missing evidence is not completion. Before reporting an exhausted queue, recheck the checkout for in-progress work.
