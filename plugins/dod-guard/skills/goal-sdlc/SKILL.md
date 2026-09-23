---
name: goal-sdlc
description: Provide full continuous-delivery guidance during built-in /goal runs while preserving goal ownership, delegated work, and existing lifecycle skill contracts.
---

# Goal SDLC

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the active plugin root.

This is a supporting skill for built-in `/goal` runs. It does not implement,
replace, or claim the built-in `/goal` command; the built-in command owns goal
persistence and continuation. Existing lifecycle skills remain authoritative:
this skill composes their contracts instead of creating a second delivery
framework.

## Delegation contract

The main thread is the high-level orchestrator. For every real work step:

1. Record one bounded checkpoint with the parent/child PBI, current branch and
   head, owned responsibility, required evidence, and applicable instructions.
2. Dispatch at least one fresh subagent with only that bounded brief. The
   subagent may edit only its owned scope and must return exact results and
   evidence; it must not choose the next step or mutate an unrelated PBI.
3. Inspect the result, read back any external mutation, and run the named proof
   before advancing the checkpoint.
4. Preserve the checkpoint on failure or interruption; repair the same step or
   record an external blocker before selecting another parent.

A delegated subagent may own PR review when the applicable review contract
permits it. The main thread still owns sequencing, evidence verification,
mutation decisions, and the built-in goal's stop condition.

Referenced `dod-guard` skills resolve by name under the active plugin root, not
by cached absolute or versioned paths. The no-worktree rule below is strict:
never create, use, register, switch to, prune, remove, or clean up a Git
worktree.

## Source Workflow

Operate as a continuous delivery worker for the current repository and its linked GitHub Project.

relevant skills:
[$dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md)

[$dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md)

[$dod-guard:next-ticket](../next-ticket/SKILL.md)

[$dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md)

[$dod-guard:review-pr](../review-pr/SKILL.md)

[$dod-guard:complete-pr](../complete-pr/SKILL.md)

target project: https://github.com/users/TychoHenzen/projects/2
target repo: based on what is in the current working directory

CHECKOUT AND EXECUTION POLICY

- Work only in the current repository checkout. Git worktrees are prohibited: do not create, use, register, switch to, prune, remove, or clean them up. If a skill or tool requires a worktree, do not use it; choose a same-checkout path or record the incompatibility as a blocker.

- Process exactly one parent PBI/delivery unit at a time, sequentially. Finish and verify it before selecting the next. Do not implement, mutate, review, or deliver multiple PBIs in parallel.



Do not stop after merging one PBI. Continue processing eligible work until the queue is empty, the user explicitly stops the goal, or every remaining item is blocked by an external condition with no safe workaround.



Assume the primary model is `gpt-5.6-luna` with `max` reasoning, this is also the model to be used for all subagents. Luna must follow the explicit state machine below; do not infer a shorter or different workflow.



Hard invariants:

- Work on exactly one parent delivery unit at a time and finish it before selecting another.

- All work is sequential; do not mutate, implement, review, or deliver multiple parent PBIs in parallel.

- Use the current repository checkout only; never create or use a Git worktree.

- Each refined parent has one non-duplicated set of mandatory child PBIs.

- All child implementation happens on one branch and one PR.

- Do not create or publish a PR until every mandatory child is implementation-complete.

- Follow the single review policy in section 6 for each delivery unit.

- After merge, mark every child and its parent complete and read the statuses back.

- Do not routinely ask the user to resolve problems. Make conservative, reversible, repository-consistent choices and continue.



Definitions:

- `implementation-complete`: all mandatory child work is implemented and verified enough to enter the PR lifecycle.

- `Project Done`: the parent and all children are marked complete after the PR is merged and final remote checks pass.

- The parent is implementation-complete when all mandatory children are implementation-complete, but Project Done is finalized with the children after merge.

- “Pre-existing” is not a deferral reason for a failure in a touched path, required suite, user-facing flow, or required gate.



CONTINUOUS QUEUE LOOP



Repeat this loop after every completed delivery unit:



STATE SNAPSHOT AND READ DISCIPLINE



Resolve the repository, linked Project, queue, selected parent and children, pull requests, branch heads, checks, permissions, and unrelated work once at goal start. Carry that read-only snapshot through the delivery loop.



Reuse snapshot data until it is invalidated. Invalidate it only after a mutation, a known remote change, a failed or timed-out operation, a user steering message, or a phase boundary that changes the relevant state.



Do not repeat identical issue, Project, PBI, pull-request, or queue reads inside one phase. If a helper needs data already in the snapshot, pass it through instead of querying the provider again. Batch only missing reads.



Pass the snapshot into each skill handoff. A skill may read a field it was not given, or an invalidated field, but it must not rerun discovery solely because the lifecycle phase changed.



Context compaction is not state invalidation. When a continuation rereads this workflow file, restore the latest handoff snapshot first. Do not rerun repository, Project, issue, PBI, pull-request, or queue discovery unless the snapshot is missing or invalidated.



Each handoff snapshot must record the snapshot time, selected parent, child and pull-request IDs, relevant branch heads, Project statuses, and the reason for the next refresh. If no snapshot survives compaction, read only the current delivery unit and rebuild the snapshot once.



After a merge, refresh the changed pull request, linked issue, parent and child items, and the next queue selection. Do not reread the entire Project or every PBI unless the snapshot was invalidated.



1\. Reconcile live state when no valid snapshot exists



Before mutating anything, use the current snapshot. If it is invalid or missing:

- Identify the target repository, remote, linked Project, current checkout/branch, tech stack, PBI statuses, parent/child links, PRs, branch SHAs, checks, permissions, and unrelated changes.

- Treat live remote state as authoritative over stale notes.

- Preserve unrelated user work. Never reset, stash, overwrite, or include it.

- Read existing child PBIs and PRs before creating anything only when they are absent from the snapshot or the snapshot was invalidated.

- Repair recoverable orphan states before selecting new work:

&#x20; - parent left in Backlog while children or a PR are advanced;

&#x20; - completed children with an incomplete parent;

&#x20; - an existing PR for the current parent;

&#x20; - a branch or checkpoint showing implementation already underway.

- If the repository or linked Project cannot be identified safely, use available repository evidence to resolve it. Ask the user only if no safe target can be determined.



2\. Choose one current delivery unit



Use this precedence:



A. If active PBIs belong to the same parent, group them into one delivery unit.



B. If multiple parent PBIs are already In Progress due to existing state, select one deterministically and leave the others untouched:

- Prefer the parent with an existing PR furthest through the lifecycle.

- Otherwise prefer the parent associated with the current checkout or branch.

- Otherwise use Project priority/order, then oldest creation time as a deterministic tie-breaker.

- Record the selected parent and leave the other parent checkpoints untouched.

- Complete and verify the selected parent before returning to the next queued parent.



C. If the selected parent is genuinely blocked after recovery:

- Preserve its branch, checkpoint, evidence, and current checkout.

- Do not abandon or reset it, and do not create a worktree to unblock it.

- If another eligible parent can progress, serialize the next parent and return to the blocked checkpoint later.

- A blocked parent is not permission to stop the entire goal.



D. If no parent is active:

- Choose one eligible parent from Todo using current Project priority/order.

- If Todo is empty, choose one eligible Backlog parent and use:

&#x20; [$dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md) with the added instructions listed under Refinement contract

- After refinement, verify the parent and required children are in Todo, then continue implementation.

- If no eligible work exists, finish the loop with a queue-empty result.



Never select a new unrelated parent while the current parent can still be advanced.



3\. Refinement contract



Refinement happens once per parent delivery unit.



Use the snapshot's existing children first. Read missing children only when the snapshot is invalidated. Create missing children, but never duplicate children or recreate a completed refinement set.



Every refined parent must have at least these four independently actionable child PBIs, linked back to the parent:



A. Implementation

- Implement the requested behavior using existing repository patterns.

- Include precise acceptance criteria and verification.

* the refinement should perform functional decomposition to split the implementation into atomic steps and create one subtask with minimal details for each



B. Wiring and end-to-end usability

- Trace the real user path through the existing UI or supported user-facing surface.

- Create missing entry points, configuration, controls, feedback, error states, and recovery paths.

- Verify the feature is discoverable, invokable, understandable, and usable.

- Exercise the path end to end.

- If live UI automation is unavailable, use the closest available integration path and document the missing evidence; do not silently mark the child complete.



C. Refactoring and quality

- Inspect both new code and nearby code.

- Remove accidental complexity, duplication, dead code, unnecessary abstractions, and spaghetti control flow.

- Prefer deletion and reuse.

- Reduce code or complexity where safe and improve real Quality Guard metrics.

- Keep cleanup bounded to the selected feature and directly adjacent code.

- The child must either make a justified cleanup or record evidence that no safe cleanup exists.



D. Fixing and reliability

- Fix errors found in the touched paths, required suites, integration path, lint/type checks, or Quality Guard.

- Do not label relevant failures “pre-existing” to defer them.

- Truly unrelated failures require evidence and a recovery decision, not silent dismissal.



Each child must contain minimal parent context, scope, acceptance criteria, and verification instructions.



After refinement:

- Verify the parent is Todo.

- Verify every mandatory child exists, is linked, and is Todo.

- If the parent remains Backlog, repair the status and read it back before implementation.

- Do not create additional children during implementation unless a genuinely independent acceptance requirement appears; update an existing child whenever possible.

- If the refinement skill cannot satisfy this contract, repair the skill minimally in the plugin cache and assign the long-term change via a new PBI assigned to the dod-guard repo instead of proceeding with an incomplete plan.



4\. Implementation and branch rules



For a newly selected Todo parent, use:

&#x20; [$dod-guard:next-ticket](../next-ticket/SKILL.md)



For an already-started parent, resume its existing checkpoint and skip completed work.



- Implement every mandatory child in the current checkout on one branch.

- Keep implementation, UI wiring, E2E work, refactoring, and fixes in that branch and checkout.

- Do not create or publish a PR until every mandatory child is implementation-complete.

* make one or more new commits for each subtask.

- Do not create a second branch or PR for the same parent delivery unit.

- Keep the diff bounded by the acceptance criteria.

- Prefer existing helpers, dependencies, patterns, and deletion.

- Do not generate speculative architecture, backwards-compatibility shims, boilerplate, unrelated noise, or huge amounts of code without a demonstrated requirement, every line of code written has an associated maintenance cost that must be considered.

- If the diff grows beyond the acceptance boundary, stop and prune it before continuing.



5\. Goal-directed validation cadence



Do not spam the full linter, full test suite, or every gate after every edit, not every subtask needs to 100% pass.



During basic implementation:

- Use only small targeted checks needed to prevent obvious dead ends.

- Build the wiring while implementing - logging and general observability are always valuable, but defer comprehensive validation until the required workstreams are substantially complete.



At the end of basic work:

1\. Run the complete relevant suite once: tests, lint/type checks, integration/E2E checks, and Quality Guard where applicable.

2\. Group failures by tool and root cause.

3\. While repairing a failure, run that failing tool or the narrowest relevant target only.

4\. Fix every failure in the selected paths and required gates.

5\. Run the complete relevant suite once more.

6\. If the confirmation suite still fails, repeat the focused-fix loop and another complete confirmation run.

7\. Do not rerun unchanged full suites merely for reassurance.



A child is not implementation-complete merely because code compiles. Record acceptance evidence for every child.



6\. PR, review, remediation, and completion



When all mandatory children are implementation-complete, use:

&#x20; [$dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md)



The resulting PR must be published/non-draft (`draft=false`). If the skill creates a draft, publish it using the supported repository operation and verify the remote state.



Review policy:

&#x20; [$review-pr-branch]



Before review:

- Inspect the PR history and checkpoint.

- Read the durable review ledger at `<directory containing Automation.md>/.beehaiive/review-checkpoints.json`. Key entries by repository and PR number.

- If a ledger entry exists with a completed review result or a reviewed head, do not invoke `review-pr-branch` or `review-pr` again. A new context, subagent, timeout, or interrupted reviewer is not a completed review or a new review slot; an incomplete execution follows the recovery rules below.

- If no entry exists, persist `reviewAttempted=true`, the PR number, the current head SHA, and the attempt time before invoking the reviewer. If that write fails, do not invoke the reviewer.

- Record the reviewed head SHA.

- One invocation of this skill is the complete PR review; do not separately rerun its internal review work.


Review outcome semantics:

- A completed reviewer run with a recommendation of `APPROVE`, `REQUEST_CHANGES`, or `BLOCK`, including any findings, is a successful review and consumes the one-review slot. A completed `BLOCK` or `REQUEST_CHANGES` result is not a failed reviewer execution.

- A launcher or process failure before a report, timeout, interruption, or other execution failure that produces no completed recommendation is an incomplete review and does not consume the one-review slot; it is not a completed `BLOCK` or `REQUEST_CHANGES` result. Preserve `reviewAttempted=true`, record the failed attempt and evidence in the durable ledger, read back the remote PR and review state, and do not rerun blindly. After the cause is repaired, recover or retry that incomplete execution until a completed reviewer recommendation exists; recovery attempts do not count as a second review. Do not repeat an unchanged failure blindly, and stop for explicit user cancellation or an external blocker.



If the review errors:

- Read back PR and review state before doing anything else.

- Preserve `reviewAttempted=true` in the durable ledger and mark the outcome as incomplete or failed, with the execution evidence.

- Use available findings, targeted checks, and advisor guidance to repair the cause before recovery or retry. Do not rerun the reviewer blindly or treat a failed execution as a completed `BLOCK` or `REQUEST_CHANGES` result; continue only when each failure has a repaired cause.



**REVIEWS CAN TAKE A VERY LONG TIME**

Do not kill a running reviewer merely because it is quiet. If it exits, times out, or is interrupted, preserve the ledger entry and treat the review as incomplete. After repairing the cause, recover or retry until a completed recommendation exists; do not start a replacement reviewer blindly, retry a completed review, or continue after explicit user cancellation or an external blocker.


After review:
- Make sure every finding made by each reviewer has a comment in the PR corresponding to the line in which the issue was found



Fix every valid finding with:

&#x20; [$dod-guard:fix-pr-review](../fix-pr-review/SKILL.md)



After fixes:

- Run focused checks for repaired areas.

- Run the complete relevant suite once.

- Verify the new head SHA.
- Verify that all finding comments have a response explaining how the issue was fixed any why that fixes the issue
- Verify that all finding comments were marked as resolved.

Then use:

&#x20; [$dod-guard:complete-pr](../complete-pr/SKILL.md)



Only complete the PR when:

- It is published and mergeable.

- The current head, not only the reviewed head, passes required checks.

- All child acceptance criteria are satisfied.

- No relevant failure is deferred as “pre-existing” (no part of the application is allowed to be broken on development - development must *ALWAYS* be 100% ready to deploy to production and be 100% usable by real end-users).

- The PR is merged and the merge state is read back.



After merge:

- Mark every mandatory child Project item complete.

- Mark the parent Project item complete in the same finalization pass.

- Read back all parent and child statuses.

- Repair any parent left Backlog, Todo, or In Progress before selecting the next delivery unit.



7\. Blocker triage and proactive recovery



For every failed, timed-out, or ambiguous action:

1\. Preserve the current checkout and branch; do not create a worktree.

2\. Capture the exact error, tool, stage, PBI, and SHA.

3\. Read back remote state because the mutation may have succeeded.

4\. Classify the failure: transient/provider, stale state/race, code/test/quality, merge conflict, authorization/policy, or skill/runtime.

5\. Choose the smallest safe recovery that will solve the problem.

6\. Run the narrowest proof that recovery worked.

7\. Resume the original checkpoint or rotate to another eligible parent if this one is externally blocked.

- Self-improvement rule: every encountered issue, execution failure, tooling or runtime defect, workflow friction, or recovery-worthy discrepancy triggers a follow-up check for an existing dod-guard PBI covering the durable fix. Deduplicate against existing issues and PBIs; if no matching PBI exists, create one through `add-backlog-idea` with the durable fix and exact incident/recovery evidence, even when the immediate incident is recovered.

- Preserve the current delivery unit and keep implementation out of the incident workaround. The workaround restores safe progress; the durable fix remains separately queued through the backlog workflow.



Retry the same exact transient failure at most once for ordinary actions. Never loop blindly.

Incomplete review executions are exempt from that cap: after each repaired cause, retry until a completed reviewer recommendation exists; never repeat an unchanged failure blindly.



For every confirmed blocker that survives local triage, use:

&#x20; [$dod-guard:codex-advisor](../codex-advisor/SKILL.md)



Use `gpt-5.6-luna` with `max` reasoning. Include repository, parent/child PBI, stage, branch, current and reviewed SHAs, exact error, attempts, constraints, and recovery options. The advisor is advice-only; implement and verify the chosen solution locally.



Do not hand routine problems back to the user:

- Infer missing details from the PBI, repository conventions, and existing behavior.

- Choose a conservative, reversible implementation when alternatives are compatible.

- Implement fixes for tool, test, wiring, or repository problems instead of merely reporting them.

- Ask the user only for an irreversible/destructive action, missing credential or authorization, genuinely incompatible requirements, or a decision no repository evidence can resolve.

- If the current parent is blocked but another parent can progress, mark the PBI as blocked, document *why* it is blocked (what is the issue, what solutions did you try, what is the problem that needs solving to unblock), preserve the work so far, then pick a new item from the queue.

- If all remaining work is externally blocked, preserve durable checkpoints and exact evidence; do not claim completion or fabricate progress.



8\. Quality Guard and cache changes



If Quality Guard fails:

- Separate actual defects from stale or invalid baseline data.

- Fix actual findings.

- Re-baseline only through the supported mechanism, recording old/new fingerprints and the reason.

- Never suppress findings or alter code merely to game the metric.



If a cached skill or script must be edited:

- Compare it with tracked source first.

- Make the smallest reversible change.

- Validate it.

- Record the exact cache path and behavior change.

- Use:

&#x20; [$dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md)

&#x20; to track the long-term dod-guard repository fix.

- A cache-only fix is not proof that the tracked plugin is fixed.



9\. Common-sense completion and continuation



Never cut:

- Security or validation.

- Accessibility basics.

- Data-integrity safeguards.

- Required acceptance criteria.

- Required tests, checks, UI wiring, or Quality Guard evidence.



You may cut speculative polish, unrelated cleanup, and unnecessary abstractions. Document each deliberate shortcut, its known ceiling, impact, and follow-up.



After every successful merge:

* continue in the current checkout; never create or manage Git worktrees
* delete both the local and the remote copy of both the merged branch as well as pro-actively finding and deleting both locally and remotely any other stale branches that have been merged back and can therefore safely be deleted,

- If the merge changed queue state, refresh the affected items and select the next eligible delivery unit once. Otherwise select from the current snapshot.

- Select the next eligible delivery unit.

- Continue the same goal loop.

- Do not mark the goal complete after one PBI.



Mark the goal complete only when no eligible work remains or the user explicitly ends it. Mark it blocked only after the same external blocker remains unresolved across three evidence-backed attempts/goal turns. Never use “two active PBIs” as a reason to stop. never stop when todo is empty but the backlog is not.
