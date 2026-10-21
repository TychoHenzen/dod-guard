---
name: goal-sdlc
description: Work through the linked GitHub Project queue continuously, one parent PBI at a time, by running the existing lifecycle skills for each item until no eligible work remains.
---

# Goal SDLC

Read `standards/working-defaults.md` and `standards/github-request-discipline.md` first. Under /goal, also read `standards/goal-stop.md`. This skill owns queue selection, sequencing, delegation, the friction log, and the stop decision. The owning skill wins on any difference. This skill never writes issue, Project, branch, or PR state itself. Closures run through the closure helper's apply, via the complete-pr section named below.

## Owners

- [refine-backlog-item](../refine-backlog-item/SKILL.md): Backlog, or next-ticket stopped with `step-plan-missing`.
- [next-ticket](../next-ticket/SKILL.md): Todo, or In Progress with no pushed handoff.
- [submit-draft-pr](../submit-draft-pr/SKILL.md): In Progress, pushed handoff, no converged draft PR.
- [review-pr](../review-pr/SKILL.md): converged draft PR, no review.
- [fix-pr-review](../fix-pr-review/SKILL.md): unresolved BLOCKER or MAJOR.
- [complete-pr](../complete-pr/SKILL.md): reviewed, no unresolved BLOCKER or MAJOR. MINOR never blocks.
- [add-backlog-idea](../add-backlog-idea/SKILL.md): work has no issue, or today's friction log is missing.

## Tool availability

The code-navigation and knowledge MCP servers (code-explorer, quality-guard, knowledge-base, serena, code-review-graph) start over stdio with the client. If one is missing from the tool list or fails to connect, do not wait for it or retry it. Use `gh`, Grep, and Read instead, and name that fallback in the first progress message of the run.

Before the first Loop step, read the client's plugin list once (`claude plugin list --json` in Claude Code, `codex plugin list --json` in Codex) and require one enabled `quality-guard@` entry, because `review-pr` cannot scan without it. If Claude lists one installed but disabled, report `claude plugin enable <id>` as the one fix and stop before claiming a parent; never enable it yourself.

## Loop

Repeat until a stop condition holds. Take one parent at a time, in the current checkout, on one branch and one PR. Never create or use a Git worktree.

1. Resume first. A dirty tree or in-progress branch usually means a delivery is underway: match its paths, branch, issue, children, and PR, then resume at the latest checkpoint. If nothing matches, capture it with `dod-guard:add-backlog-idea`, refine it, then resume it. Never discard, stash, or fold dirty work into an unrelated PBI.
2. Clean the queue, then select.
   - In `../complete-pr/scripts`, run `node closure.mjs snapshot --repository=<owner/name> --output=<file>`. On a non-zero exit, stop and report the error. Never plan from an older snapshot.
   - Run `node closure.mjs plan --snapshot=<file>`. Report every close, hold, and `unverified-closed` entry with its reason.
   - Delegate closes and status repairs to complete-pr's section `Close delivered issues for goal-sdlc` as one write-capable stage, then reread.
   - Run `closure.mjs annotate` on the snapshot. It supplies `activeCheckpoint` and `trustedHeadSha`.
   - In this skill's directory, run `node scripts/select-next.mjs --snapshot=<file>`. Report its holds. `queueState: held` is not exhaustion.
3. Follow `dod-guard:quick-pbi` steps 2 to 6 and run the owner whose condition the parent meets. On `step-plan-missing`, refine, then rerun next-ticket. If refinement needs a user answer, leave the parent in Backlog with the questions recorded and move on.
4. On `conflict-triaged`, go to submit-draft-pr for the new head. Otherwise, if any parent or child status is not Done, return to the completion owner. If all are Done, go to step 1.

## Delegation

The main thread sequences and checks. Subagents are Agent-tool subagents in Claude Code and spawned agents in Codex; user-visible threads (`create_thread`, `fork_thread`, `send_message_to_thread`, `codex://threads/...`) are not subagents. Each stage runs in one fresh subagent as one step of `dod-guard:step-by-step`. Dispatch, stage briefs, overrides, checks, and "Escalation" follow `standards/model-routing.md`. Build each brief from the Runs column and add nothing else. Dispatch each row on the agent in its Agent column, never on another agent. Pass no `model` or `effort` unless the row is strong or the user named one: the agent file pins them, so a cheap row runs on Haiku. Write no template, copy, summary, or rules file of a skill. Name stage, tier, model, and effort in progress messages. A rerun uses its row's tier.

- No row starts on the strong tier.
- A stage report naming a live child, a pending named proof, or a still-applied temporary probe is incomplete. Resume that stage at its checkpoint. Launch no replacement.
- Read back the commit of any stage that changed tracked files before the next stage.
- A cheap complete-pr run stops at `merge_conflict`. The main thread then runs conflict triage.
- Retire a subagent near 100,000 tokens of context. Brief a fresh one with the compact checkpoint.
- Before claiming a parent, look for another active goal or agent run on its repository, parent, branch, and stage. If one exists, mutate nothing: wait, or fail closed and name it as owner if its head or handoff disagrees. PR, issues, and handoff comments are the only ownership record; create no lock file or local ledger.

Agent names take the `dod-guard:` prefix.

| Stage | Tier | Agent | Runs |
|---|---|---|---|
| Queue snapshot read | cheap | read-cheap | Follows Loop step 2, dispatched twice: first only `closure.mjs snapshot` and `plan`, returns plan. After the closes, only fresh `snapshot`, `annotate`, `select-next.mjs`, returns selection. Close delegation stays on main thread |
| Refinement owner thread | standard | stage-standard | Skill `dod-guard:refine-backlog-item <issue>` |
| Refinement plan research questions | standard | read-standard | "Research and discovery triage" in refine-backlog-item |
| Refinement investigate code, callers, tests | cheap | read-cheap | Same section |
| Refinement decide classification and criteria | standard | read-standard | Same section |
| next-ticket owner thread | cheap | stage-cheap-skill | Skill `dod-guard:next-ticket <issue>` |
| next-ticket implement one task | cheap | stage-cheap | Follow step plan in <scratch file> holding the task's `## Step plan: <task-id>` comment saved unchanged |
| next-ticket validations and regenerate artifacts | cheap | stage-cheap | Same file, run only its validation commands |
| submit-draft-pr | cheap | stage-cheap-skill | Skill `dod-guard:submit-draft-pr <issue>` |
| review-pr owner thread | cheap | stage-cheap-skill | Skill `dod-guard:review-pr <pull-request>` |
| review-pr plan | standard | read-standard | Step 5 "Plan" |
| review-pr investigate | cheap | read-cheap | Step 5 "Investigate" |
| review-pr judge and merge pass | standard | review-pr-feature, review-pr-design, review-pr-reliability, review-pr-hygiene; merge pass on read-standard | Step 5 "Judge" and "Merge" |
| fix-pr-review owner thread | standard | stage-standard | Skill `dod-guard:fix-pr-review <pull-request> <finding-ids>` |
| fix-pr-review apply written per-finding fix | cheap | stage-cheap | Follow fix plan in <scratch file>, saved unchanged |
| complete-pr guarded merge and Project finalization | cheap | stage-cheap-skill | Skill `dod-guard:complete-pr <pull-request>` |
| complete-pr close delivered issues (Loop step 2) | cheap | stage-cheap-skill | Skill `dod-guard:complete-pr`, only its section "Close delivered issues for goal-sdlc" |
| Merge conflict triage owner/plan/judge | standard | stage-standard, read-standard | `standards/conflict-triage.md` |
| Merge conflict triage investigate/apply | cheap | read-cheap, stage-cheap | `standards/conflict-triage.md` |
| add-backlog-idea incl. friction log | cheap | stage-cheap-skill | Skill `dod-guard:add-backlog-idea <request>` |

## Blockers

Follow the failure-recovery rule in `standards/working-defaults.md`, including `dod-guard:codex-advisor` for a blocker that survives local triage. A blocked parent is not a reason to stop. Record on its issue what blocks it, what was tried, and what would unblock it. Keep its branch and checkpoint and select the next eligible parent. On a provider rate limit, record the reset time, work other parents, and retry once after it.

## Friction log

Record every tool failure, skill defect, or workflow friction, even if recovered, in one issue per day titled exactly `Friction log YYYY-MM-DD` (today's local date). Find it with one search for that title. Create it only if none exists, via add-backlog-idea, with entries under `## Entries`.

- If today's log has an entry for the same friction, add the occurrence there. Else if one search finds an open PBI that owns the fix, comment there. Else append a new entry.
- Each entry is a `###` section: what happened (error, tool, stage, PBI, SHA), workaround, durable fix (files and change), how to verify.
- Re-read the issue before appending and read it back after.
- The queue holds today's log while it collects entries. From the next day it is ordinary Backlog work.
- When a dod-guard skill is wrong, log the defect and its source-repo fix, then continue with the workaround.

## Reporting

The final report states how many parent and child PBIs reached Done, counting only the target repository's items whose Project status reads Done, as `counts` from select-next reports.

When every remaining parent is blocked, send one short message starting with `Blocked:` that assumes no prior context: repository, PBI number and title, what blocks it, evidence, what was tried, and the one decision or action needed, in plain words.

## Stop condition

Stop only when no eligible parent remains after verified holds, a user stop condition is met, the user ends the run, or every remaining parent stays blocked by the same external cause across three evidence-backed attempts.

Finishing one PBI, an empty Todo column with a non-empty Backlog, and an empty selection from selector defects or missing evidence are not reasons to stop. Recheck the checkout for in-progress work before reporting an exhausted queue.
