# Using dod-guard

## Set up a repository

Run from the local project that should join the dod-guard workflow:

```text
/dod-guard:setup-repository
```

The skill preserves existing Git and project configuration. When no GitHub
remote exists, it collects the owner, repository name, visibility, and default
branch before creating one. It pushes reviewed files, waits for generated
quality checks, links one Project with `Backlog`, `Todo`, `In Progress`, and
`Done`, enables supported security settings, and then protects the default
branch. Setup establishes the shared priority, effort, and classification
labels without changing repository-specific labels. Solo-owner protection
explicitly requires zero approving reviews; independent review and checks on
the current pull-request head still gate delivery.

Unsupported plan features, failed checks, ambiguous Projects, and likely
credentials stop setup with a mutation ledger. The skill never rewrites
history, force-pushes, or silently replaces configuration.

Across delivery skills, ordinary failures retain their branch and checkpoint.
After an uncertain write, the skill reads back the affected remote state before
any retry, repairs the smallest verified cause, and resumes. One identical
transient retry is allowed; safety, authority, credential, provider/head, and
required-evidence failures still stop the workflow.

## Backlog to draft PR

Capture one or more requested features without designing them:

```text
/dod-guard:add-backlog-idea TychoHenzen/dod-guard Add a stale-asset report using tracked plugin files, and show installed and available plugin versions in the marketplace list
```

The repository argument is every backlog item's target repository. The skill
creates one issue for each outcome that can be implemented, verified, and
closed independently and is useful on its own. Different implementation parts
of one user-visible capability stay in one issue. A single outcome still
creates one issue.

Backlog items are real issues, not drafts, so the Project Repository field
stays populated. The result maps every identified feature to its issue URL.

Run the complete lifecycle without intermediate confirmation:

```text
/dod-guard:quick-pbi Add the requested outcome
```

`quick-pbi` invokes `/add-backlog-idea`, `/refine-backlog-item`,
`/next-ticket`, `/submit-draft-pr`, `/review-pr`, `/fix-pr-review`, and
`/complete-pr` in order. It asks only the batched clarification questions that
refinement requires. It fixes every validated actionable review finding and
uses that completed review's recommendation before the guarded merge; it does
not invoke another reviewer after fixes. If the reviewer launcher or process
fails before producing a terminal recommendation, it reconciles the ledger and
remote review state, repairs the cause, and retries rather than treating the
execution failure as a review result.

Refine one Backlog item into a coherent, independently deliverable Todo PBI,
with independently completable subtasks when needed:

```text
/dod-guard:refine-backlog-item 42
```

Refinement reads affected code, callers, tests, and architecture before choosing
priority, Fibonacci effort, and standard labels from the repository's live
descriptions. It then triages missing user constraints, external context, and
genuine tradeoffs. Interactive refinement uses ordinary conversation to batch
independent `/interview` questions; an active goal or explicitly non-interactive
run asks one fresh `/codex-advisor` with `gpt-5.6-luna` at `max` effort for
bounded advice instead. Targeted web or Context7 research resolves external
facts, and `$debate` runs only after facts and constraints are known. Discovery
evidence,
accepted and rejected options, and unresolved decisions stay in the issue's
implementation notes. Missing scale labels stop refinement. Re-refinement from
Backlog reuses current evidence and repeats only stale or newly triggered phases.
Unknown priority records the missing information. Effort 13 stays in Backlog
and requires independent issues before implementation. Body, labels, links,
and discovery evidence are verified before Todo. Material unresolved
requirements, including unavailable or inconclusive advisor advice, keep the
issue in Backlog until the missing decision or evidence is available.

## Structured work

Use the ordinary path for a small, clear fix. Use the structured path when a
feature or material ambiguity needs explicit decisions, a plan, tasks, and a
convergence check. The canonical records and handoffs are in
[`standards/project-workflow.md`](standards/project-workflow.md).

| Stage | Owner | GitHub-backed artifact | Handoff |
| --- | --- | --- | --- |
| Principles | `/setup-repository` | Repository instructions | Existing rules guide capture and refinement. |
| Problem | `/add-backlog-idea` | Issue in `Backlog` with concise outcome and scope | Refine one coherent issue. |
| Requirements | `/refine-backlog-item` | Issue `Outcome`, `Scope`, and checked `Acceptance criteria` | Clarify gaps, then plan. |
| Clarification | `/refine-backlog-item` | `Implementation notes` with decisions and discovery evidence | Only resolved requirements enter the plan. |
| Plan | `/refine-backlog-item` | `implementation-plan` record in the issue | Break the plan into actionable tasks. |
| Tasks | `/refine-backlog-item` | `task-list` record and four mandatory linked child PBIs for structured work | `Todo` PBI hands every child evidence to implementation on one branch and PR. |
| Implementation handoff | `/next-ticket` | Issue task list, issue branch, commits, and verification evidence | A pushed branch can enter draft-PR convergence. |
| Convergence | `/submit-draft-pr` | Draft PR `## Convergence` section and any actionable issue remainder | Review and acceptance remain separate. |

On the structured path, `/next-ticket` leaves one durable `## Implementation
handoff` comment on the parent issue, mapping every task and mandatory child to
its commit or verified remote-state evidence, checks, and user-path result.
`/submit-draft-pr` compares that handoff with the issue contract and copies the
mapping into `## Convergence`; missing or contradicted evidence stays an
actionable remainder. Small, clear fixes use the ordinary path instead.

The structured path does not create a parallel local plan. It preserves stops
for material ambiguity, credentials, destructive or authority-bound actions,
unrelated work, provider or head mismatch, and missing high-risk evidence.
OpenSpec is historical reference material only. It is not an active runtime or
dependency.

All GitHub-backed commands follow the shared request policy in
[`standards/github-request-discipline.md`](standards/github-request-discipline.md).

Start or continue the Todo PBI from the repository's main checkout. Use an
isolated worktree only when that checkout cannot safely retain the selected
branch and user-owned changes, and record the exception and recovery path:

```text
/dod-guard:next-ticket 42
```

The selected issue must contain a short outcome, implementation notes, and
verifiable acceptance criteria. Use GitHub sub-issues for criteria that should
be completed independently.

`next-ticket` inspects pending Git changes. Clearly in-scope ordinary changes
use the normal commit path. Secrets, destructive intent, unrelated changes,
and work that cannot be separated safely remain stop conditions.

`next-ticket` then:

1. Resolves the GitHub repository and its explicitly linked open Project.
2. Creates and pushes `codex/<issue>-<slug>` from the current default branch.
3. Assigns the issue and moves it to `In Progress`.
4. Implements and verifies the acceptance criteria.
5. Runs the completion review, then commits and pushes.

The reviewer receives the PBI, linked sub-issues, repository instructions, final
diff and files, and verification evidence. The coordinator checks every challenge
and records it as `resolved`, `invalid`, or `irrelevant` with evidence. Valid gaps
block commit and implementation push until repaired and its affected checks are
rerun; do not invoke another completion review.
The initial branch-only push remains permitted. An unavailable or failed review
also blocks completion. The result reports every disposition before stopping
with the verified branch pushed. This review edits no files or remote comments.

## Execute an explicit plan

Use `/step-by-step` with a numbered plan, or name one repository plan file.
The main thread keeps the checkpoint and verifies every result; each fresh
subagent receives only one bounded step. It does not discover plans, create a
branch or pull request, skip failed steps, or restart completed work.

```text
/dod-guard:step-by-step
1. Add the focused test.
2. Implement the smallest behavior.
3. Run the named verification.
```

## Learn the repository

Use `/learn-repository` when you want the assistant to teach one small concept
from the current source, callers, tests, configuration, or documentation. The
skill asks what to explore, offers related topic choices, and checks your
understanding with a restatement, trace, prediction, or example.

Use `/teach-back` when you want to explain what you learned while the assistant
acts as a curious student. It asks one question at a time, tests why and how,
separates facts from inferences and unknowns, and periodically gives you a
short correction opportunity. Each skill points to the other, but you choose
when to switch.

## Ask for a bounded second opinion

Use the Codex advisor when a fix or design needs independent advice before
implementation:

```text
/dod-guard:codex-advisor
```

The skill sends a bounded prompt containing fixed advice-only instructions and
the complete problem description through stdin to a separate `codex exec`
process. It uses `gpt-5.6-luna` with `max` reasoning by default and accepts an
optional `--model=<model>` setting. It uses an
empty non-repository working directory, read-only restrictions, and an
ephemeral session, and tells the advisor to skip repository research and
mutations. It probes the direct executable's version and help before launch;
write-capable review launchers use `--approve-for-me`, while this advisor never
uses approval flags. Missing commands, non-zero exits, timeouts, and malformed
responses remain visible incomplete failures. The result reports the CLI
version, model setting, reasoning effort, and complete process evidence; the
CLI keeps advice on stdout and emits one JSON execution record on stderr. The
skill never edits files,
changes Git or GitHub state, or dispatches another advisor.

Submit or refresh its draft pull request in a separate step:

```text
/dod-guard:submit-draft-pr 42
```

Close a sub-issue only after its implementation commit is pushed. An
administrative sub-issue may close after its remote state is verified and the
evidence is recorded in a comment.

`submit-draft-pr` adds `Closes #<issue>` only after the evidence exists. The
agent must not approve its pull request, mark it ready, merge it, or close the
parent issue.

Review the current branch, a named Git ref, or a GitHub pull request without
checking it out:

```text
/dod-guard:review-pr
/dod-guard:review-pr origin/codex/42-example
/dod-guard:review-pr https://github.com/owner/repository/pull/42
```

The skill loads the linked PBI and subtasks, then runs feature, design,
reliability, and hygiene reviewers independently. Local Git findings use the
active client's inline code comments. GitHub findings become one comment-only
review on validated changed lines.

Azure DevOps is an additional explicit mode. It writes one Markdown report and
posts no inline comments:

```text
/dod-guard:review-pr https://dev.azure.com/owner/project/_git/repository/pullrequest/42 reports/review-42.md
```

Fix selected local or GitHub inline findings, or Azure report entries:

```text
/dod-guard:fix-pr-review #42 GH-12345
/dod-guard:fix-pr-review reports/review-42.md ADO-42-1
```

The skill reloads the parent PBI and linked subtasks, then rechecks each
finding against the current head. It skips stale or unsupported findings. It
pushes the smallest verified fix before replying to or resolving GitHub
threads. Azure entries change to `Fixed` with commit and check evidence while
unresolved entries stay unchanged.

After review, explicitly accept and complete the current pull request:

```text
/dod-guard:complete-pr 42
```

`complete-pr` accepts either a draft or ready pull request. It records the
accepted head first and marks a draft ready only when needed. It then enables
guarded auto-merge, updates a stale base only from the accepted head, waits for
required checks, confirms the merge and linked issue state, and deletes the
unchanged remote head branch. Conflicts, failed checks, permission errors,
unexpected pushes, and changed branch refs stop the command.

## Release a marketplace change

After the changed plugin has its own manifest version bump and local gates
pass, use:

```text
/dod-guard:publish
```

It delegates draft pull-request creation to `/submit-draft-pr`. After a human
merges it and the published commit has green CI, refresh both clients:

```text
Claude Code: /plugin marketplace update dod-guard, then /reload-plugins
Codex: codex plugin marketplace upgrade dod-guard-monorepo
Codex: codex plugin add dod-guard@dod-guard-monorepo
```

For a maintenance-only release, the skill snapshots the complete `master`
protection, validates the exact
`branches/master/protection/enforce_admins` endpoint and HTTP response before
the temporary admin toggle, and restores and compares the complete snapshot in
its cleanup path. An endpoint, response, or readback mismatch stops before the
push; a failed restoration gets one bounded retry and then reports the exact
remaining difference.

A successful maintenance result reports the published SHA, the lease SHA, full
protection restoration equality, the restore retry count, required-check status,
and client-refresh status. Missing cleanup or any required evidence is a
failure, not a successful release.

Confirm `codex plugin list` reports the released version. Do not copy files
into either client cache manually.

This repository does not publish npm packages or tags.

## Quality dashboard

Run `quality-dashboard.cmd` from this repository root. The dashboard reads each
registered project's `.quality/quality-report.json`; it never runs a scanner or
edits a project.
