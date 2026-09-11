# Structured project workflow

This is the canonical stage map for work that needs more than the ordinary
issue, branch, test, and draft-PR path. It is guidance for GitHub-backed
artifacts, not a per-ticket planning file.

## Choose the path

Use the structured path for a feature, material ambiguity, several dependent
decisions, or work that needs an explicit plan and convergence check. Use the
ordinary path for a small, clear fix with known scope, acceptance, and tests.
Both paths use the repository's linked GitHub Project, issue, branch, commits,
and pull request as the source of truth.

## Principles and source of truth

- Existing repository instructions in `AGENTS.md` and `CLAUDE.md` are the
  project-principles source. Preserve both when both exist and follow the
  repository's existing import convention. Do not add a second constitution.
- The GitHub issue holds the outcome, requirements, decisions, plan, tasks,
  acceptance criteria, and verification. Project Status records lifecycle.
  Branch history and the pull request hold implementation and review evidence.
- OpenSpec material is historical reference only. It is not an active runtime,
  dependency, or source of truth.
- PBI #59 owns forgiving defaults, dirty-worktree handling, stale-test policy,
  and functional-style guidance. This map composes with those rules instead of
  replacing or duplicating them.
- The structured path never bypasses stops for material ambiguity, credentials,
  destructive or authority-bound actions, unrelated work, provider or head
  mismatch, or missing high-risk evidence.

## Stage map

| Stage | Owner | GitHub-backed artifact | Handoff |
| --- | --- | --- | --- |
| Principles | `setup-repository` | Repository instructions | Existing rules guide capture and refinement. |
| Problem | `add-backlog-idea` | Issue in `Backlog` with concise outcome and scope | Refine one coherent issue. |
| Requirements | `refine-backlog-item` | Issue `Outcome`, `Scope`, and checked `Acceptance criteria` | Clarify gaps, then plan. |
| Clarification | `refine-backlog-item` | `Implementation notes` with decisions and discovery evidence | Only resolved requirements enter the plan. |
| Plan | `refine-backlog-item` | `implementation-plan` record in the issue | Break the plan into actionable tasks. |
| Tasks | `refine-backlog-item` | `task-list` record and independent linked sub-issues only when needed | `Todo` PBI hands the task list to implementation. |
| Implementation handoff | `next-ticket` | Issue task list, issue branch, commits, and verification evidence | A pushed branch can enter draft-PR convergence. |
| Convergence | `submit-draft-pr` | Draft PR `## Convergence` section and any actionable issue remainder | Review and acceptance remain separate. |

## Structured handoff records

For a structured PBI, keep these records in the issue's `## Implementation
notes`. The exact prose can vary, but the names and meaning stay stable:

- `requirements`: observable user stories, constraints, and non-goals.
- `clarifications`: resolved decisions and their evidence. Keep
  `unresolved-decision` entries when a decision is not safe to invent.
- `implementation-plan`: affected owners, approach, and verification approach.
- `task-list`: ordered tasks with a clear dependency and an `independent`
  marker only when a task can be committed and closed separately.

`refine-backlog-item` owns these records. It keeps a material unresolved
requirement in `Backlog` and moves a coherent PBI to `Todo`. `next-ticket`
uses the records as its implementation handoff and maps tasks to changed
files, commits, and checks. It does not create a parallel local plan.

## Convergence record

Before a structured PBI gets a draft PR, `submit-draft-pr` compares the
implementation with the outcome, requirements, clarifications, plan, tasks,
acceptance criteria, and verification evidence. The draft PR body records:

```text
## Convergence
- Outcome: verified or actionable remainder
- Requirements and clarifications: verified or named remainder
- Plan and tasks: each mapped to applicable branch or verified remote-state evidence
- Acceptance and verification: each mapped to fresh evidence
- Remainder: none, or the exact next task and owner
```

An incomplete or contradicted result is not reported as complete. Before any
remainder write, snapshot the issue body, task list, labels, links, Project item,
and Status. Immediately before each remainder mutation, reread those values and
compare them with the latest snapshot. If any value changed, stop and report the
drift without writing. After each successful mutation, read back the changed
state and replace the snapshot before the next mutation. Leave the PBI or its
task list with an actionable remainder and stop before creating or updating the
draft PR. Small fixes use the ordinary verification path and do not require
these records.
