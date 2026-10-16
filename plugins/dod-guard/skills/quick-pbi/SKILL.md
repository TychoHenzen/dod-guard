---
name: quick-pbi
description: Run a user-requested GitHub PBI from backlog capture through refinement, implementation, draft PR, review, fixes, and guarded merge with no prompts except material refinement clarifications.
argument-hint: "<requested outcome>"
---

# Quick PBI

Take one requested outcome and carry it to a merged pull request. Read `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root first. Load each skill named below from the active plugin root before you invoke it.

## Interaction contract

A concrete feature request authorizes the routine lifecycle. Invoking this skill authorizes every commit, push, review publication, and the final `dod-guard:complete-pr` run on the verified final head. Do not pause for ceremonial confirmation. Ask no confirmation between stages.

The only allowed user interaction is the clarification round that `dod-guard:refine-backlog-item` owns. Collect all currently independent questions in one round, ask them together, then resume the same issue with the answers. Ask nowhere else. If a material answer stays unavailable, leave the issue in its real state and stop.

Use the current repository, or the one the user names. If the target, Project, credentials, branch, head, or evidence cannot be resolved, stop and report the exact blocker. Do not ask for a fallback. Never invent a requirement, and never continue past a failed gate.

Shape the work this way:

- Create or reuse one associated parent PBI for the request, and move it to `In Progress`.
- Use one branch, its commit series, and one draft PR for the whole parent.
- Open a child PBI only for a functional slice that can be delivered and verified on its own. Keep dependent atomic steps in the parent checklist.
- Treat a linked child as checklist work on the parent's branch and PR.
- Assess four lenses: `implementation`, `wiring/usability`, `quality`, and `reliability`. Attach each concern to the slice or task that owns it. Create no child issue for a lens.
- Under `wiring/usability`, require proof that the feature is reachable from its intended UI or supported user-facing surface.
- Under `quality`, include cleanup.
- Under `reliability`, cover failure and recovery beyond the happy path.

## Run the lifecycle

This skill coordinates the existing delivery skills. It does not replace their safety gates or evidence requirements. Run the stages in this order. Pass each stage's result to the next one.

1. Capture. Invoke `dod-guard:add-backlog-idea` once, with the whole request. If it creates several independent issues, keep its feature split and issue mappings, and process them one at a time in creation order. If part of the text cannot be assigned to a feature, stop with that blocker, and do not ask and do not guess.
2. Refine. Invoke `dod-guard:refine-backlog-item <issue-number>`. When refinement finishes, the issue moves to `Todo` before the next stage starts.
3. Implement. Invoke `dod-guard:next-ticket <issue-number>`. Its pushed branch, commit, and checks are the handoff. Choose no other ticket.
4. Open the PR. Invoke `dod-guard:submit-draft-pr <issue-number>`. Keep the pull request number and head it reports.
5. Review and fix.
   - Invoke `dod-guard:review-pr <pull-request>`. It scans the changed files, runs the reviewer agents, and posts one comment-only review. It yields exactly one review. A completed `APPROVE`, `REQUEST_CHANGES`, or `BLOCK` recommendation is the one review, even when it carries findings.
   - If the review stops without posting a review, record the reason and the PR URL as a durable blocker and stop.
   - Read the recommendation and reviewed commit back from the remote PR; no local ledger is needed.
   - For every valid unresolved finding (`BLOCKER` or `MAJOR`), invoke `dod-guard:fix-pr-review <pull-request> <finding-ids>`, with ids in the form `GH-<id>`. Fix each actionable finding. Decline any other with evidence. Then rerun affected checks, respond to and resolve each finding, and push. Do not invoke another review after those fixes.
6. Merge. Invoke `dod-guard:complete-pr <pull-request>` once every `BLOCKER` and `MAJOR` finding is fixed and resolved, or recorded as not actionable with evidence. Also require that the required checks pass and that the PR head is the head the fixes pushed. A `MINOR` note has no thread and blocks nothing. If `complete-pr` reports `unresolved-review-threads`, clear them with `dod-guard:fix-pr-review <pull-request> <finding-ids>` and invoke `dod-guard:complete-pr <pull-request>` again.

If any stage fails, stop without rollback or duplicate issues. Then report these items: issue, branch, PR, commit, review, check, Project, and merge state, plus the failed stage and the next evidence needed.
