---
name: next-ticket
description: Execute a refined GitHub Project PBI through implementation, verified commits, and a pushed branch. Use when the user asks to pick up, start, or continue a ready PBI. Use submit-draft-pr to create its pull request.
---

# Next ticket

Take one ready PBI from `Todo` to a pushed branch: branch, assign, `In Progress`, implement, verify, commit, push.

Resolve the plugin root from this skill's directory. Before editing, read `standards/working-defaults.md`, `standards/github-request-discipline.md` (section "Resolve the repository and Project"), and `standards/project-workflow.md`. Do not assume the target repository has them. Where this skill is stricter, it wins. Keep the one-parent-branch, one-PR boundary aligned with refine-backlog-item, submit-draft-pr, complete-pr, and project-workflow.

## Checkout and safety

- The current directory must be inside a Git worktree.
- Run `git worktree list --porcelain`. Work in the first entry, the main checkout, when it can safely create the branch from the fetched default. If it is locked, unavailable, active, or unsafe and user-owned, stop and report the reason, the checkout, and the recovery path.
- "Unsafe and user-owned" means pending paths that cannot be classified as in scope, or a checkout whose HEAD is not on the default branch and holds unpushed commits. The own branch of a resumed or adopted ticket (`codex/<issue-number>-<slug>` checked out under "Resume", or the branch checked out under "Adopt") and its own unpushed commits are not unsafe. Any other branch or unpushed commit stays unsafe.
- Never create a worktree.
- Run `git status --short --branch` and classify every pending path. A dirty tree alone is not a blocker.
- Ordinary changes that clearly belong to the work stay uncommitted until the ticket branch exists, then are committed there. Never commit them on the current or default branch to clear status.
- Preserve and report secrets, destructive intent, unrelated changes, and work that cannot be separated safely. Never reset, stash, overwrite, move, or silently include user-owned changes.
- Never create a tracked planning file; keep temporary notes outside the repo or remove them before commit.
- Follow any smaller-step boundary in repository instructions.
- Never bypass stops for credentials, destructive or authority-bound actions, unrelated work, provider or head mismatch, or missing high-risk evidence.

## Project and ticket

Run `node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>`. Stop on outcome `none`, outcome `several`, or exit 2. Never pick a Project by title similarity or from a remembered owner. Report the Project owner, number, and title, then use it for lookup.

For a user-supplied issue number run `node <plugin-root>/skills/complete-pr/scripts/ticket-preconditions.mjs --repository=<owner/name> --issue=<n> --expect-status=Todo`. For a resume under "Resume" in "Prepare and start", pass `--expect-status="In Progress"` instead. Stop on exit 1 and report its `check` and `detail`; exit 2 is a read failure to report. It replaces checking repository membership, Project membership and Status by hand. Without one, list open Project items from this repository, keep unassigned issues with Status exactly `Todo`, drop pull requests, and show number, title, assignee, status. Select a lone result automatically. Otherwise the user chooses.

## Readiness

A small clear fix may take the ordinary path. A feature or materially ambiguous PBI uses the seven records in project-workflow as its handoff (`requirements` through `planned-acceptance-matrix`, including `lens-ownership`).

A ready ticket has a change description, implementation notes, checkbox acceptance criteria with observable outcomes, and one `## Step plan: <task-id>` comment per task (`task-1` for a PBI with no task list). Linked sub-issues are open, or closed with pushed implementation evidence; a parent with none is valid as one coherent slice. In a structured PBI each child is actionable, `Todo`, owned by a task, and maps to exactly one independently deliverable slice, and `lens-ownership` maps `implementation`, `wiring/usability`, `quality`, and `reliability` to a task or slice with observable acceptance or verification evidence. A task owning cross-cutting parent work with no child carries `parentLevel: "convergence"`.

Stop before implementation when the issue is incomplete (name the missing section, never invent requirements), a child is duplicated, mis-mapped, or not actionable, or a lens has no owner.

A missing step plan, a plan from an author the step plan rule does not accept, or a plan that leaves a design decision open is stop `step-plan-missing`. Name the task, change nothing, and report to the dispatcher, which runs `dod-guard:refine-backlog-item` on the parent. Never write or complete a step plan.

Before the branch exists, save the issue body as read back from GitHub to a UTF-8 file and run:

`node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>]`

Pass `--children` as a JSON array of linked functional-slice children (slice id plus evidence) when any exist. It prints `{outcome, remainder}`: exit 0 is `verified`, exit 1 an actionable remainder, exit 2 a usage or parse error. On exit 1, stop and report the `remainder` entries verbatim to the dispatcher for `dod-guard:refine-backlog-item`. On exit 2, re-save the body as UTF-8 and rerun once; if it exits 2 again, stop and report the `remainder` message. It reads UTF-8, UTF-8 with a BOM, and UTF-16 with a BOM (what PowerShell 5.1 `>` writes), and rejects any other non-UTF-8 file with exit 2. After the handoff is pushed, rerun it with the exact head and matrix and require freshness. Implementation evidence must be pushed before commit or PR handoff, not before execution.

## Prepare and start

Fetch the remote default branch first. Name the branch `codex/<issue-number>-<slug>`, under 64 characters. The slug is lowercase ASCII from the title (letters, digits, single hyphens, none leading or trailing). Shorten only the slug. Except under "Resume" and "Adopt" below, the branch must not exist locally or on `origin`, and you never create or switch to an existing branch.

Except under "Resume" below, the issue must currently be `Todo`. Resolve the project item id, numeric project number, live Status field id, and `In Progress` option id. Stop before any mutation if a value is missing or ambiguous. Never hardcode ids from an earlier run. Selecting the ticket authorizes the branch, assignment, and status changes, so ask no further confirmation. In order:

1. Create the local branch from the fetched remote default, keeping the classified in-scope pending changes. If Git cannot do that without losing them, stop. Do not stash, discard, or commit elsewhere.
2. Push with upstream tracking to the same-named branch on `origin`.
3. Assign the issue through the GitHub MCP assignee operation. Fall back to `gh issue edit {issue-number} --repo {owner}/{repo} --add-assignee '@me'`. Always quote `@me`: PowerShell consumes an unquoted `@me`, and `gh` then fails with `flag needs an argument: --add-assignee`. Then read the assignees back with `gh issue view {issue-number} --repo {owner}/{repo} --json assignees --jq '.assignees[].login'`, and require the authenticated login from `gh api user --jq .login`.
4. Run `node <plugin-root>/skills/complete-pr/scripts/project-status.mjs <owner> <project-number> <status-field-node-id> <in-progress-option-id> "In Progress" <item-id>`. It reads the item back before you continue. The fifth argument (`In Progress` here) is the Status name to set and the readback target, not a precondition; an item already at it prints `changed: false` and gets no write. Pass the numeric item id: a `PVTI_` id is found only through the items list, which can lag. For the full argument contract run `node <plugin-root>/skills/complete-pr/scripts/project-status.mjs --help`.
5. Start-state check: the assignee readback holds the authenticated login, the Project Status readback is `In Progress`, and `git branch --show-current` equals the issue branch. Stop before implementing on any mismatch, naming the field, the value read and the value expected. Put the three values on the first line of the `## Implementation handoff` entry for the first task.

After a failed, timed-out, or ambiguous action, read back the local and remote branch, assignee, and Project status, then resume only the missing action. Never create a second branch or repeat a mutation before its readback. Report which actions completed and keep the branch and remote state. Do not roll back.

### Resume

An explicit request for an `In Progress` issue resumes instead of starting; `dod-guard:goal-sdlc` lists this skill as the owner of an `In Progress` issue with no pushed handoff. When the issue is `In Progress`, assigned to the current user, and `codex/<issue-number>-<slug>` exists locally or on `origin`, read back the local and remote branch, the assignee, and the Project status, skip every start action that is already complete, and run only the missing ones. Never create a second branch. When the branch exists nowhere, or another user is assigned, the `Todo` and no-existing-branch rules above apply unchanged.

Before it switches to that branch, classify the branch. Save the comments from `gh api --paginate --slurp repos/{owner}/{repo}/issues/{issue}/comments` as a UTF-8 file. Read the tip with `git rev-parse origin/<branch>`, its committer date with `git log -1 --format=%cI origin/<branch>`, and its distance from the default with `git rev-list --count origin/<default>..origin/<branch>`. Run `node <plugin-root>/skills/next-ticket/scripts/resume-state.mjs --comments-file=<comments.json> --author=<login> --tip=<sha> --tip-date=<iso> --ahead=<n>`, with the login from `gh api user --jq .login`. It prints `{state, reason}`. Exit 2 is a usage or read failure to report. Then switch to that branch (fetch it from `origin` first when it is not local) only when the tree is clean or every pending path is classified in scope.

- `live-handoff`: stop `resume-live-handoff`, change nothing, and report to the dispatcher that `dod-guard:submit-draft-pr` owns the issue. Never restart a branch whose pushed handoff names its tip.
- `resumable`: continue as the paragraph above says.
- `superseded`: a step plan was replaced after the branch's work, so the branch holds a superseded design. Restart from the default branch without deleting, resetting, rebasing, or force-pushing anything. First post one comment headed `## Superseded branch` with the lines `Branch: <branch> at <tip>` and `Reason: <reason>`, then read the comments back and confirm exactly one carries that `Branch:` line; with zero, repost once. Then, on the clean branch, run `git restore --source=origin/<default> --staged --worktree -- .`. Run `git diff --quiet origin/<default>`; it must exit 0, otherwise stop `restart-not-clean` and report. Commit with the message `chore: restart #<issue> from <default> after a superseded design` and the attribution line your brief gives, stage no other path, push, and confirm the push as "Commit and push" says. The superseded commits stay in history. Then implement every task from its step plan on top of the restart commit. The next resume reads `resumable`, because the restart commit postdates every plan.

### Adopt

A pushed `codex/<issue-number>-*` branch that already holds work is adopted, not refused, when every condition below holds after `git fetch origin`. The issue must be `Todo`, as above. Under `dod-guard:goal-sdlc` the selector holds a root whose branch has no open pull request, so adoption there starts only from an explicit request or from a branch with an open pull request. Under adoption, "the issue branch" in the start-state check and in "Commit and push" is the adopted ref name, whatever its slug.

Read these from Git and GitHub, never from memory. Replace `<branch>` with the one branch found, `<default>` with the default branch, and `<local-tip>` with the local branch tip:

```text
git ls-remote --heads origin "codex/<issue-number>-*"
git merge-base --is-ancestor <local-tip> origin/<branch>
git diff --name-only origin/<default>...origin/<branch>
gh api "repos/{owner}/{repo}/pulls?state=all&head={owner}:<branch>&per_page=100"
```

1. The first command lists exactly one branch. None means this section does not apply: create the branch as above. Two or more is stop `branch-not-adoptable`.
2. No local branch of that name exists, or the second command exits 0 for its tip. A local tip that is ahead of or diverged from `origin/<branch>` is stop `branch-not-adoptable`.
3. Every path the third command prints is the file of at least one step in this parent's step plan comments. Any other path is stop `branch-not-adoptable`, naming the paths.
4. The fourth command lists no closed or merged pull request, no pull request whose head repository is not this repository, and at most one open pull request, which must be a draft because `dod-guard:submit-draft-pr` stops on any other. Record that pull request's number.
5. The issue is unassigned or assigned to the authenticated login (`gh api user --jq .login`), and no `## Implementation handoff` comment by another author exists. Otherwise another run or person owns the work: stop `branch-not-adoptable`, naming the assignee or the comment author.

On a stop, name the failed condition, change nothing, and report to the dispatcher. Never delete, reset, rebase, or force-push the branch.

On adoption:

- Check the branch out only when the tree is clean or every pending path is classified in scope: `git switch --track origin/<branch>` when no local branch exists, otherwise `git switch <branch>` then `git merge --ff-only origin/<branch>`. Skip start actions 1 and 2, because the branch exists and is pushed. Run start actions 3 to 5 unchanged.
- For each task, dispatch `dod-guard:stage-cheap` with the brief "Run only the validation commands of the step plan in <scratch file>, skipping every step whose first line starts with `Control:`". A control step is left out because its result differs by design once the change exists. A task whose other steps all print their expected result is delivered: dispatch no implementation, and cite as its evidence the commits that `git log --format=%H origin/<default>..HEAD -- <the task's files>` lists. Implement any other task on top of the adopted commits as "Implement" says. Never rewrite an adopted commit.
- After the three start-state values, put `adopted <branch> at <sha>` and the open pull request number (or `none`) on the first line of the `## Implementation handoff` entry for the first task. `dod-guard:submit-draft-pr` then finds that pull request by its head branch and updates it.

## Implement

The issue description, notes, and acceptance criteria are the task contract. Add no behavior it does not require. Read the repository instructions for every touched file, and inspect affected code, callers, and tests before editing. Implement every criterion, with automated tests where possible. Prefer small pure functions, I/O at the boundaries.

Dispatch every task, including a one-task PBI's single task, to `dod-guard:stage-cheap` from its step plan comment. Save the comment unchanged to a scratch file outside the repository. The brief is the "Stage brief" in `standards/model-routing.md`: first line `Follow the step plan in <scratch file>.`, then the branch and the proofs to return. With more than one task, run each as one step of [`dod-guard:step-by-step`](../step-by-step/SKILL.md), passing the task list as a calling-skill plan with a commit per step and one fresh subagent per task.

- This thread writes no step plan and decides no design question. Validations and artifact regeneration also go to `dod-guard:stage-cheap`. Put the issue branch name in every dispatch brief, because a dispatched worker never commits.
- Wait on every helper synchronously: run it in the foreground, or wait for its completion notification. Never wait on a loop, poll, or `until` condition that depends on a process being absent or present (for example "no `dotnet` process is running"): stray long-lived processes keep such a loop alive and stall the owner.
- Identify a stage worker by its task id, never by its sender address: a worker's messages arrive under your own address. Run one foreground worker at a time, and hold exclusive write access to the issue branch. When `ListAgents` shows any running agent other than your own id and your dispatcher's id, compare it with the workers you dispatched. Report an unexplained writer by id to the dispatcher and change nothing.
- A worker report that says it waits on its own background work means that worker is live, not finished. Before any replacement dispatch, list the running agents, stop the old worker with the client's stop operation (`TaskStop` in Claude Code), and confirm it is gone from the list. Never run two writers on one branch.
- Do not end your turn, and do not report a stage result, while any child you dispatched is still running. A report written before every child reaches a terminal result is interim, not final.
- Edit tracked files here only when the brief carries the failure record of an earlier cheap run of that task (a check failed twice, or a plan was reported unappliable).
- When running as `dod-guard:stage-cheap-skill` and a task fails that way, stop the stage and report the failure record to the dispatcher, which reruns it under the Escalation section of model-routing.
- Each task report names its dispatch (agent, model, effort) or the escalation record behind an owner edit. A report with neither is a failed check.
- For a structured PBI, map each task to files, commit, and fresh verification. Never report a task complete when its requirement is contradicted or evidence is missing.

## Verify

Use the repository's documented build, test, lint, and format commands: focused checks while working, then every pre-PR gate. Commands that cross PowerShell, native executables, or a POSIX shell follow [command composition](../../docs/command-composition.md).

- When refinement recorded a repository PR gate command in the Implementation notes or a step plan, this thread runs that exact command on the committed head after it commits each task, and lists new highs in that task's report. A gate that diffs a base against HEAD sees only committed work, so never run it on a dirty tree. Run it again before the first push that carries commits; the empty-branch push in "Prepare and start" carries none and needs no gate. Stop, naming the finding, only where the repository's required gate would block (its own block-on setting); report every other finding in the task report. When no command was recorded, say so in the report and continue. Never choose a command, flag or patch here.
- Confirm the test glob includes every new test or fixture before calling a suite green. Expand the glob to separate paths (see [command composition](../../docs/command-composition.md)), then run `node --test --test-reporter=spec --test-name-pattern=__no_such_test__ <path> [<path>...]` and confirm each new test file path prints. The pattern matches no test name, so no named test runs. Node has no list mode, and `--test-name-pattern=.` runs every test. A fixture is confirmed by a listed test file that reads it. This relies on the spec reporter printing one line per test file on Node 22; recheck it if the runner changes.
- Do not rerun an unchanged full suite. A suite consuming a changed or added fixture, scene, seed, or shared test data is not unchanged: run every consumer before push.
- A consumer suite that cannot run locally is named in the handoff as pending exact-head CI outside the acceptance matrix, and carried into the PR body. That alone does not stop PR handoff, but its exact-head CI must pass before review, with the run ID in the Preflight checkpoint (or the handoff if none).
- When CI must run again on a head, rerun the existing run with `gh run rerun <run-id> --failed`; never dispatch a second workflow run for the same head.
- On a failing test, update a stale expectation or fix the implementation. Never weaken or delete a test just to pass.
- Generate tracked build outputs on the feature branch. Never rely on CI to write or repair them.
- Quality diagnostics are report-only: generate or persist no metric state.
- Live runtime tool proofs (MCP for a game, app, emulator): read the tool's schema (MCP `tools/list`) and send only declared arguments. Wait for its readiness signal, or record that none exists and use its documented ready condition or a no-op call. Failing to become ready is a failure under working-defaults failure-recovery. After a rejected or malformed call, never retry identical arguments: make one schema-corrected call or switch to the nearest supported proof, and record the switch and original error in the matrix row (or the `## Implementation handoff`).

### Evidence records

Map each acceptance criterion to fresh evidence. A structured PBI builds one `## Acceptance matrix` in the handoff: one row per criterion and mandatory user-facing path, with the fields in project-workflow and only the statuses `pass`, `unverified`, `failed`, `blocked`, `inapplicable` (the last needs a reason). Add identity/authorization, interactive-control, browser/E2E, data/error, and recovery rows when they apply, otherwise record why not. Validate every row against the checked-out and pushed head. Map every linked child to its task, files or state, commit, and verification.

Give every task its own evidence ids (`ev-t3-change`, not a shared `ev-change`): the proof reports `evidence <id> is mapped more than once` when two owners claim one id. A lens has exactly one entry; the proof reports `<id> lens-ownership entry is declared more than once` and `<lens> review lens is declared more than once`. When a new convergence task covers a lens that another task already owns, change that entry's `owner` to the new task instead of adding a second entry.

Write no `## Preflight checkpoint`: this skill ends at the push, before any PR exists. `dod-guard:submit-draft-pr` writes the record into this handoff once the draft exists, as `standards/project-workflow.md` defines it. A rebuild of a handoff that already holds one carries it over, as "Commit and push" says. When this skill pushes a new head onto a branch whose draft PR exists and the rebuilt handoff holds no `## Preflight checkpoint` (none to carry over), it runs `dod-guard:submit-draft-pr` in Update mode once the post-push proof in "Commit and push" passes and before review or merge, which writes the record at the new head. The report names that run and its result.

Stop before commit or PR handoff when any row, criterion, child, required check, or proof is missing, failed, unverified, blocked, or head-mismatched. State the exact failed command or remainder.

## Commit and push

Before every commit, run `git branch --show-current`; it must equal the issue branch `codex/<issue-number>-<slug>`. On a mismatch, stop with no commit and report the current and the expected branch; never commit on the default branch or any other branch. Include pending changes only if in scope and covered by the final diff. Inspect status, the complete diff, and the staged diff. Stage only reviewed files that belong to the issue, never in bulk. Write a concise commit message naming the outcome. Use the attribution line your brief gives, verbatim, and never your own model's trailer. Push to the existing upstream and confirm it as "Confirm every push" in `standards/working-defaults.md` says, comparing `git ls-remote --heads origin <branch>` with `git rev-parse HEAD`, before the handoff comment. Never force-push or rewrite commits. Before the first push that carries commits, the recorded gate run above must have passed at the same head.

After the push, read the issue's comments, then create or update one parent-issue comment headed `## Implementation handoff`. When a comment by the authenticated user already carries the heading, update that comment with `gh api --method PATCH repos/{owner}/{repo}/issues/comments/<id> -F body=@<file>` and never post a second. The comment holds an entry per ordered task and linked child (evidence, files, fresh result), then the single matrix. `dod-guard:submit-draft-pr` appends the single checkpoint once the PR exists. Build the comment text with `node <plugin-root>/skills/next-ticket/scripts/handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha>` (evidence file format in the script's header: the body supplies every id, slice and evidence id, and the file only what was observed), and save its stdout as `<handoff.md>`. It encodes the matrix with JSON.stringify, so write evidence as plain text and never hand-write the matrix JSON. Write no `## Preflight checkpoint` block: `dod-guard:submit-draft-pr` does. A rebuild of a handoff that already has the block adds `--previous-handoff-file=<handoff.md>` so the block is carried over. Post the comment with `gh api --method POST repos/{owner}/{repo}/issues/{issue}/comments --input <file>` or `-F body=@<file>`, never with `-q` or `--jq`: a jq error after a request that succeeded looks like a failed post and invites a duplicate. Then read the issue's comments back and confirm exactly one comment by the authenticated login carries the heading before any retry. Count only that login's comments: a handoff-headed comment by anyone else never counts. With zero matches by that login, repost once and read again. With two or more by that login, the newest by creation time is the current handoff, never the earliest. Save the comments from `gh api --paginate --slurp repos/{owner}/{repo}/issues/{issue}/comments` as a UTF-8 file, and run `node <plugin-root>/skills/next-ticket/scripts/handoff-select.mjs --comments-file=<comments.json> --author=<login> --output-dir=<dir>`, with the login from `gh api user --jq .login`. `PATCH` each listed superseded comment with its file, then read the comments back with the same paginated command and rerun `handoff-select.mjs` on that readback until it lists no superseded comment, so exactly one comment by that login carries the heading. Another author's handoff-headed comment is listed as ignored and left alone. Post nothing more. The matrix is the durable acceptance record for submit-draft-pr and complete-pr, so never copy it to a local ledger or second issue. State the remainder, and write `none` only when everything is evidenced at the same head.

The matrix in that comment is the one fenced `json` block under `## Acceptance matrix`, not a markdown table. After the comment is read back, save the issue body as read back from GitHub and the handoff comment as UTF-8 files, then run post-push at the pushed head. The builder output is already UTF-8 text and may be reused as the `--handoff-file`; write it with the Write tool or `Out-File -Encoding utf8`, never PowerShell 5.1 `>`.

`node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs post-push --body-file=<path> --handoff-file=<path> --head-sha=<sha> [--children=<path>]`

Stop before PR handoff on exit 1 or 2. Fix the matrix rows and rerun. When the proof names a lens that is not bound to the handoff head, the lens stores a head (refinement should have rejected it): delete `headSha` and `head` from the `lens-ownership` entries in the issue body, change nothing else, and rerun. Never write a head into a lens.

Report repository, Project, issue, branch, commit, the remote head read back with `git ls-remote`, checks, each criterion mapped to evidence, any new gate findings per task, and any check that could not run. Stop after the push, and after the Update-mode run when "Evidence records" requires one: `dod-guard:review-pr` is the one independent review.
