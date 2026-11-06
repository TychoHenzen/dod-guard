---
name: goal-sdlc
description: Work through the linked GitHub Project queue continuously, one parent PBI at a time, by running the existing lifecycle skills for each item until no eligible work remains.
---

# Goal SDLC

Read `standards/working-defaults.md` and `standards/github-request-discipline.md` first. Under /goal, also read `standards/goal-stop.md`. This skill owns queue selection, sequencing, delegation, the friction log, and the stop decision. The owning skill wins on any difference. This skill never writes issue, Project, branch, or PR state itself, with one exception: `scripts/park.mjs` writes or deletes a parked record under "Blockers". Closures run through the closure helper's apply, via the complete-pr section named below.

## Owners

- [refine-backlog-item](../refine-backlog-item/SKILL.md): Backlog, a Todo root that select-next reports as `needs-refinement` (Status stays Todo), or next-ticket stopped with `step-plan-missing`.
- [next-ticket](../next-ticket/SKILL.md): Todo, or In Progress with no pushed handoff.
- [submit-draft-pr](../submit-draft-pr/SKILL.md): In Progress, pushed handoff, no converged draft PR.
- [review-pr](../review-pr/SKILL.md): converged draft PR, no review.
- [fix-pr-review](../fix-pr-review/SKILL.md): unresolved BLOCKER or MAJOR.
- [complete-pr](../complete-pr/SKILL.md): reviewed, no unresolved BLOCKER or MAJOR. MINOR never blocks.
- [add-backlog-idea](../add-backlog-idea/SKILL.md): work has no issue, or today's friction log is missing.

## Tool availability

The code-navigation and knowledge MCP servers (code-explorer, quality-guard, knowledge-base, serena, code-review-graph) start over stdio with the client. If one is missing from the tool list or fails to connect, do not wait for it or retry it. Use `gh`, Grep, and Read instead, and name that fallback in the first progress message of the run.

Before the first Loop step, read the client's plugin list once (`claude plugin list --json` in Claude Code, `codex plugin list --json` in Codex) and require one enabled `quality-guard@` entry (Claude: an array item whose `id` starts with `quality-guard@` and whose `enabled` is true; Codex: an `installed` item whose `pluginId` starts with `quality-guard@` and whose `enabled` is true), because `review-pr` cannot scan without it. If the list command exits non-zero, including a client binary that cannot be found, or no `quality-guard@` entry exists, stop before claiming a parent and report the exact command, its exit code, and the missing entry as separate facts. If Claude lists one installed but disabled, report `claude plugin enable <id>` as the one fix and stop before claiming a parent; never enable it yourself. These stops come before any parent exists, so the Blockers rule does not apply to them.

## Loop

Repeat until a stop condition holds. Take one parent at a time, in the current checkout, on one branch and one PR. Never create or use a Git worktree. Other worktrees in `git worktree list --porcelain` belong to the owner's other sessions: leave them alone, never treat one as a blocker or its absence as a requirement, and never remove, reset, or inspect them for changes.

At the start of every iteration, before step 1, read `version` from `.claude-plugin/plugin.json` (Codex: `.codex-plugin/plugin.json`) under the plugin root, which is two directories above this skill's base directory, and compare it with the `dod-guard <version>` recorded in your last progress message. When they differ, a release refreshed the plugin during the run: reload this skill (the Skill tool in Claude Code, a read of its SKILL.md in Codex), re-read `standards/model-routing.md` from the new root, and use the new root for every brief and script path from then on. Begin the first progress message of every iteration with `dod-guard <version>`. Resolve every plugin path from the loaded skill's base directory each time, and never reuse a cache path with a version in it from an earlier message or note.

1. Resume first. A dirty tree or in-progress branch usually means a delivery is underway, but another agent session may own it. Before reading the tree as this run's own delivery, check for a peer: in Claude Code call `ListAgents`, in Codex inspect the active agent list. A peer is busy when that list reports it as busy or running. If the lookup fails or is unavailable, the peer state is unknown: touch nothing, report the exact error, and select a different parent. If a peer is busy, touch nothing and report it by name. In Claude Code, wait once with `SendMessage` and `notify_when_idle: true`, then repeat the peer check once. Codex has no wait, so it only reports. If the peer is still busy after that one recheck, or in Codex, select a different parent and leave the tree to the peer. If the peer went idle, re-read the tree, branch, and PR before matching. The peer check only decides whether the tree is yours: the ownership rule in Delegation (`Before claiming a parent`) still decides who owns a parent. With no busy peer, match the dirty tree's paths, branch, issue, children, and PR, then resume at the latest checkpoint. If nothing matches, capture it with `dod-guard:add-backlog-idea`, refine it, then resume it. Never discard, stash, or fold dirty work into an unrelated PBI. A queue group the selector reports as `unfinished delivery branch` (a pushed `codex/<issue>-*` branch with no open pull request) is such a delivery: the selector starts no Todo or Backlog parent while one exists. Report it to the user and wait. Never resume it automatically and never delete the branch to clear the hold.
2. Clean the queue, then select.
   - In `../complete-pr/scripts`, run `node closure.mjs snapshot --repository=<owner/name> --output=<file>`. On a non-zero exit, stop and report the error. Never plan from an older snapshot.
   - Run `node closure.mjs plan --snapshot=<file>`. Report every close, hold, and `unverified-closed` entry with its reason.
   - Delegate closes and status repairs to complete-pr's section `Close delivered issues for goal-sdlc` as one write-capable stage, then reread.
   - Run `node closure.mjs annotate --snapshot=<file> --output=<annotated-file>`. It supplies `activeCheckpoint` and `trustedHeadSha`.
   - In this skill's directory, run `node scripts/select-next.mjs --snapshot=<annotated-file>`. Report its holds. Report every `unlinkedPullRequests` entry with its reason too. `queueState: held` is not exhaustion.
   - For each group of kind `needs-refinement`, run `refine-backlog-item` on its root as one stage with the Status left at Todo, then take a fresh snapshot and select again, because the snapshot holds the old body.
3. Follow `dod-guard:quick-pbi` steps 2 to 6 and run the owner whose condition the parent meets. On `step-plan-missing`, refine, then rerun next-ticket. If refinement needs a user answer, leave the parent in Backlog with the questions recorded and move on.
4. On `conflict-triaged`, go to submit-draft-pr in update mode for the new head. After `dod-guard:fix-pr-review` pushed a fix, its "Rebind the handoff" section has already rewritten the checkpoint at the new head, so run no submit-draft-pr for it. Otherwise, if any parent or child status is not Done, re-evaluate the Owners table against the parent's current PR and review state and run the owner whose condition it now meets, as in step 3; never assume complete-pr. If no owner's condition matches, record the parent as a blocker under Blockers. If all are Done, go to step 1.

## Delegation

The main thread sequences and checks. Subagents are Agent-tool subagents in Claude Code and spawned agents in Codex; user-visible threads (`create_thread`, `fork_thread`, `send_message_to_thread`, `codex://threads/...`) are not subagents. Each stage runs in one fresh subagent as one step of `dod-guard:step-by-step`. Dispatch, stage briefs, overrides, checks, and "Escalation" follow `standards/model-routing.md`. Build each brief from the Runs column and add nothing else. Dispatch each row on the agent in its Agent column, never on another agent. Pass no `model` or `effort` unless the row is strong or the user named one: the agent file pins them, so a cheap row runs on Haiku. Write no template, copy, summary, or rules file of a skill. Name stage, tier, model, and effort in progress messages. A rerun uses its row's tier.

- No row starts on the strong tier.
- A stage report naming a live child, a pending named proof, or a still-applied temporary probe is incomplete. Resume that stage at its checkpoint. Launch no replacement.
- Read back the commit of any stage that changed tracked files before the next stage.
- A cheap complete-pr run stops at `merge_conflict`. The main thread then runs conflict triage.
- Retire a subagent near 100,000 tokens of context. Brief a fresh one with the compact checkpoint: the parent issue number, the branch, the last pushed SHA, the stage, the completed task ids, the pending named proofs, and the one next command. Put nothing else in it.
- Before claiming a parent, look for another active goal or agent run on its repository, parent, branch, and stage. PR, issues, and handoff comments are the only ownership record; create no lock file or local ledger. If one exists, mutate nothing on that parent, name the other run as its owner, and select a different parent meanwhile. Date the other run's last checkpoint with `gh api` as the later of the `updated_at` of the parent's newest `## Implementation handoff` comment and the committer date of the remote branch head. Under 1 hour old, wait: recheck the parent only after the other eligible parents are worked or held. At 1 hour or older, when neither value can be read, or when its head or handoff disagrees, fail closed: leave the parent untouched and report the other owner.

Agent names take the `dod-guard:` prefix.

| Stage | Tier | Agent | Runs |
|---|---|---|---|
| Queue snapshot read | cheap | stage-cheap | Follows Loop step 2, dispatched twice: first only `closure.mjs snapshot` and `plan`, returns plan. After the closes, only fresh `snapshot`, `annotate`, `select-next.mjs`, returns selection. Close delegation stays on main thread |
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
| review-pr investigate | cheap | stage-cheap | Step 5 "Investigate" and "Investigator batch" |
| review-pr judge and merge pass | standard | review-pr-feature, review-pr-design, review-pr-reliability, review-pr-hygiene; merge pass on read-standard | Step 5 "Judge" and "Merge" |
| fix-pr-review owner thread | standard | stage-standard | Skill `dod-guard:fix-pr-review <pull-request> <finding-ids>` |
| fix-pr-review apply written per-finding fix | cheap | stage-cheap | Follow fix plan in <scratch file>, saved unchanged |
| complete-pr guarded merge and Project finalization | cheap | stage-cheap-skill | Skill `dod-guard:complete-pr <pull-request>` |
| complete-pr close delivered issues (Loop step 2) | cheap | stage-cheap-skill | Skill `dod-guard:complete-pr`, only its section "Close delivered issues for goal-sdlc" |
| Merge conflict triage owner/plan/judge | standard | stage-standard, read-standard | `standards/conflict-triage.md` |
| Merge conflict triage investigate/apply | cheap | read-cheap, stage-cheap | `standards/conflict-triage.md` |
| add-backlog-idea incl. friction log | cheap | stage-cheap-skill | Skill `dod-guard:add-backlog-idea <request>` |
| Park or unpark a root (Blockers) | cheap | stage-cheap | In this skill's directory, run only the `node scripts/park.mjs` command the main thread gives, and return its JSON and exit code |

## Blockers

Follow the failure-recovery rule in `standards/working-defaults.md`, including `dod-guard:codex-advisor` for a blocker that survives local triage. A blocked parent is not a reason to stop. Record on its issue what blocks it, what was tried, and what would unblock it. Keep its branch and checkpoint and select the next eligible parent. On a provider rate limit, record the reset time, work other parents, and retry once after it.

The selector reads two records, so write the one that matches the cause:

- A prerequisite issue must finish first: the parent is blocked by it through GitHub's `blocked_by` relationship, which the selector already reads. Add no parked record.
- No issue can finish first (an unanswered owner decision, an external service, a failed attempt that needs a human): park the root with `node scripts/park.mjs --action=park --repository=<owner/name> --issue=<root> --blocked=<one line> --unblocks-when=<one line>`. The selector then holds that root, with both lines in its reason, until the comment is deleted. A parked In Progress root is held ahead of resume, so park only after recording the branch and checkpoint on the issue.
- Only the user releases a park, by deleting the comment or by asking for `node scripts/park.mjs --action=unpark --repository=<owner/name> --issue=<root>`. A run never unparks on its own reading that the cause is gone.
- An `unfinished delivery branch` hold needs no `blocked_by` link and no parked record, and a run never works around it: only the user finishes the branch into a pull request or deletes it.
- Order that has no code dependency lives only in Project order, which is the selector's default ranking within a status. Only the user reorders a chain of Project items; a run never does so to schedule work.

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

Stop only when no eligible parent remains after verified holds, a user stop condition is met, the user ends the run, every remaining parent stays blocked by the same external cause across three evidence-backed attempts, or the plugin check in Tool availability fails.

Finishing one PBI, an empty Todo column with a non-empty Backlog, and an empty selection from selector defects or missing evidence are not reasons to stop. Recheck the checkout for in-progress work before reporting an exhausted queue.
