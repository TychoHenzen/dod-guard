---
name: quick-pbi
description: Run a user-requested GitHub PBI from backlog capture through refinement, implementation, draft PR, review, fixes, and guarded merge with no prompts except material refinement clarifications.
argument-hint: "<requested outcome>"
---

# Quick PBI

Run one complete PBI lifecycle. This skill coordinates the existing delivery
skills and does not replace their safety gates or evidence requirements.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Load each
referenced skill from the active plugin root before invoking it.

## Interaction contract

- Treat invoking this skill as authorization for the listed lifecycle,
  including commits, pushes, review publication, and `/complete-pr` for the
  final verified pull request head.
- Ask no confirmation between stages. The only allowed user interaction is the
  batched clarification round owned by `/refine-backlog-item`.
- Use the current repository or an explicitly supplied target repository. If
  the target, linked Project, credentials, branch, head, or required evidence
  cannot be resolved, stop and report the exact blocker instead of asking the
  user to choose a fallback.
- Never invent a requirement or silently continue past a failed gate.
- A concrete feature request authorizes the routine lifecycle without a second
  planning or permission round: create or reuse one associated parent PBI,
  move it to `In Progress`, and carry that feature through one branch, its
  commit series, and one draft PR. Use functional decomposition during
  refinement: create child PBIs only for independently deliverable and
  verifiable functional slices, and keep dependent atomic steps in the parent
  checklist. Explicitly assess these review lenses:
  `implementation`; `wiring/usability` for wiring and end-to-end usability,
  including proof that the feature is reachable from its intended UI or
  supported user-facing surface; `quality` for refactoring and code quality,
  including cleanup; and `reliability` for failure/recovery beyond the happy
  path. Attach each concern to the slice or parent task that owns it
  instead of manufacturing category children. Linked child PBIs remain
  checklist work delivered through the parent's single branch, commit series,
  and draft PR.
- Do not pause for ceremonial confirmation before issue, Project, branch,
  commit, push, or draft-PR actions already covered by this skill. Ask only the
  batched refinement questions for material constraints, or a real external
  blocker that repository evidence cannot resolve.

## Run the lifecycle

1. Invoke `/add-backlog-idea` once with the complete user request. Keep its
   feature split and issue mappings. If it creates multiple independent
   issues, process them one at a time in creation order. If capture reports
   text that cannot be assigned to a feature, stop with that blocker and do not
   ask the user to assign it or guess where it belongs.
2. For each created issue, invoke `/refine-backlog-item <issue-number>`.
   When refinement finds missing user constraints, ask all currently
   independent questions in one round, wait for the answers, and resume the
   same issue. Do not ask questions in any other stage. If a material answer
   remains unavailable, leave the issue in its actual state and stop.
3. Invoke `/next-ticket <issue-number>` after refinement moves the issue to
   `Todo`. Use its pushed branch, commit, and checks
   as the implementation handoff. Do not select another ticket.
4. Invoke `/submit-draft-pr <issue-number>` and retain the returned pull
   request and head.
5. Invoke `/review-pr <pull-request>`. It scans the changed files, runs its
   reviewer agents, and posts one comment-only review. A completed
   `APPROVE`, `REQUEST_CHANGES`, or `BLOCK` recommendation is the one review of
   this pull request, including when it contains findings. Read the
   recommendation and reviewed commit back from the remote PR; no local ledger
   is needed. If `/review-pr` stops without posting a review, record its
   reason and the PR URL as a durable blocker and stop. For findings, invoke
   `/fix-pr-review <pull-request> <finding-ids>` with every valid unresolved
   finding, rerun affected checks, and respond to and resolve each finding.
   Do not invoke another review after those fixes.
6. Invoke `/complete-pr <pull-request>` once every finding is fixed and
   resolved, or recorded as not actionable with evidence, all required checks
   pass, and the head is the one the fixes pushed. Its guarded merge is the
   acceptance boundary authorized by this skill.

If any stage fails, stop without rollback or duplicate issues. Report completed
issue, branch, pull request, commit, review, check, Project, and merge state,
then report the exact failed stage and its next required evidence or decision.
