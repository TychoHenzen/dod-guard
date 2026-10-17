---
name: quick-pbi
description: Run a user-requested GitHub PBI from backlog capture through refinement, implementation, draft PR, review, fixes, and guarded merge with no prompts except material refinement clarifications.
argument-hint: "<requested outcome>"
---

# Quick PBI

Read `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root and apply them. Load each skill below from the active plugin root before you invoke it. This skill chains those skills and never replaces their gates or evidence rules.

## Authority

Invoking this skill authorizes the whole lifecycle: commits, pushes, review publication, and the guarded merge of the verified head. Never ask for confirmation between stages. The one permitted interaction is the single batched clarification round that `refine-backlog-item` owns.

Target the current repository, or one the user names. Never invent a requirement. If the target, linked Project, credentials, branch, head, or required evidence cannot be resolved, stop and report the exact blocker. Never ask the user to pick a fallback, and never continue silently past a failed gate.

## Shape of the work

A concrete feature request needs no second planning or permission round. Create or reuse exactly one parent PBI and move it to `In Progress`. Deliver it through one branch, one commit series, and one draft PR.

During refinement, create child PBIs only for slices that are independently deliverable and verifiable. Keep dependent atomic steps in the parent checklist. Children are checklist work delivered on the parent's branch and PR.

Assess four lenses: `implementation`, `wiring/usability` (proof the feature is reachable from its intended user-facing surface), `quality`, and `reliability` (failure and recovery). Attach each concern to the slice or parent task that owns it. Never create category-named children.

## Stages

1. Run `dod-guard:add-backlog-idea` once with the complete request. Keep its feature split and issue mappings. For several independent issues, process them one at a time in creation order. If it reports text that fits no feature, stop with that blocker.
2. Run `dod-guard:refine-backlog-item <issue-number>` for each issue. Ask all independent questions in one round, wait, then resume the same issue. Ask nothing in any other stage. If a material answer stays unavailable, leave the issue in its actual state and stop.
3. Run `dod-guard:next-ticket <issue-number>` only after refinement moves the issue to `Todo`. Take its pushed branch, commit, and checks as the handoff. Never select another ticket.
4. Run `dod-guard:submit-draft-pr <issue-number>`. Keep the returned pull request and head.
5. Run `dod-guard:review-pr <pull-request>`. A completed `APPROVE`, `REQUEST_CHANGES`, or `BLOCK` counts as the one review, even with findings. Read the recommendation and reviewed commit back from the remote PR, with no local ledger. If review-pr stops without posting, record its reason and the PR URL as a durable blocker and stop.
   Only `BLOCKER` and `MAJOR` findings have a `GH-<id>` thread. `MINOR` has none and blocks nothing. Run `dod-guard:fix-pr-review <pull-request> <finding-ids>` once with every valid unresolved `BLOCKER` and `MAJOR` id. It fixes or declines each finding with evidence and resolves the thread. Rerun affected checks. Never run another review.
6. Run `dod-guard:complete-pr <pull-request>` only when every `BLOCKER` and `MAJOR` is resolved or recorded not-actionable with evidence, required checks pass, and the head is the one the fixes pushed. Its guarded merge is the acceptance boundary this skill authorizes. If it stops on `unresolved-review-threads`, clear the named threads with fix-pr-review and run it again.

## Failure

On any stage failure, stop. Do not roll back and do not create duplicate issues. Report the completed state (issue, branch, PR, commit, review, checks, Project, merge) and the exact failed stage with the next evidence or decision it needs.
