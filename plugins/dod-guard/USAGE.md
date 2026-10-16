# Using dod-guard

## Set up a repository

Run from the local project that should join the dod-guard workflow:

```text
/dod-guard:setup-repository
```

The skill preserves existing Git and project configuration. When no GitHub
remote exists, it creates the resolved target as a public repository with an
explicit `private: false` payload, reads that exact repository back, and stops
before `origin`, push, Project, security, or protection mutations if the
readback is missing or contradictory. Existing remote visibility is preserved;
setup never makes an existing private repository public. It pushes reviewed files, waits for generated
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
An active command-session handle is authoritative in-progress state: wait or
poll that same handle to a terminal result before retrying or launching another
copy, preserve the exact command and session evidence, and treat missing
intermediate output as non-failure. Only explicit cancellation or confirmed
session failure permits a retry; cancel only the invocation-owned process or
session when required, confirm it stopped, then resume.

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
not invoke another review after fixes. If `/review-pr` cannot post
its review, the run stops with that blocker.

`goal-sdlc` repeats that lifecycle across the linked Project's queue. It picks
the next parent PBI with `scripts/select-next.mjs` (which classifies the
annotated closure snapshot by `owner/name#number` through the classifier it
shares with the closure helper), runs the `quick-pbi` stages from the one that
parent has reached, and continues until no eligible work remains.
`closure.mjs annotate` only overlays `activeCheckpoint` and `trustedHeadSha`
from the completion records and leaves every relation as read. Each pass starts
with a cleanup report from `closure.mjs plan`: the delivered and superseded
issues it closes through `apply`, every hold, and every closed or Done record
without verified evidence, which it reports and never reopens. The snapshot
reads only non-archived Project items, so a verified root archived before
`apply` no longer closes its `supersedes` originals, and an archived sub-issue
or parent leaves a `readback missing` hold instead of a parent close. An
owner's `not_planned` hand close with no `supersedes` root, completion record,
or closure evidence is not reported; a `completed` hand close without evidence
still is. A parent that needs a user answer or is externally blocked stays in
place while the queue moves on. Each stage runs in one fresh subagent on a
model tier from
`standards/model-routing.md`, by one rule: haiku for anything that needs a lot
of effort but low intelligence, sonnet only for tasks that need the added
intelligence, and opus only when sonnet or haiku cannot figure it out. The
cheap tier (Haiku, `gpt-5.6-luna` in Codex) implements every task from a
written step plan, runs validations, answers planned questions, drafts the pull
request, runs the `/review-pr` owner thread, and completes the guarded merge.
The standard tier (Sonnet, `gpt-5.6-terra` in Codex) plans, decides, and
judges, and owns the stages that write plans or absorb a failed row. The strong
tier (Opus, `gpt-5.6-sol` in Codex) is reached only by escalation after a lower
tier failed its check twice. The main thread checks cheap-tier output before
anything relies on it and reads back each stage's commit. A stage whose owner
splits its work, such as `/review-pr`, runs on the skill-capable agent of the
owner's own tier, and that agent dispatches the split rows itself. Run the
`/goal` session itself on a standard-tier model: the loop only sequences stages
and checks their results. The final
report says how many parent and
child PBIs reached Done. That figure counts only the target repository's parent
and child PBIs whose Project status reads Done, as select-next's `counts` report
them, even when the linked Project spans several repositories.

Refine one Backlog item into a coherent, independently deliverable Todo PBI,
with independently completable subtasks when needed:

```text
/dod-guard:refine-backlog-item 42
```

Refinement reads affected code, callers, tests, and architecture before choosing
priority, Fibonacci effort, and standard labels from the repository's live
descriptions. It then triages missing user constraints, external context, and
genuine tradeoffs. Interactive refinement uses ordinary conversation to batch
independent clarification questions; an active goal or explicitly
non-interactive run asks one fresh `/codex-advisor` for bounded advice instead.
Targeted web or Context7 research resolves external facts, and an expert-lens
debate runs only after facts and constraints are known. Discovery
evidence,
accepted and rejected options, and unresolved decisions stay in the issue's
implementation notes. Missing scale labels stop refinement. Re-refinement from
Backlog reuses current evidence and repeats only stale or newly triggered phases.
Unknown priority records the missing information. Effort 13 stays in Backlog
and requires independent issues before implementation. Body, labels, links,
and discovery evidence are verified before Todo. Material unresolved
requirements, including unavailable or inconclusive advisor advice, keep the
issue in Backlog until the missing decision or evidence is available.

### Stop a `/goal` run

Under Claude Code `/goal`, a small model grades only the condition text
against the conversation after every turn. A later "stop" message cannot end
the run unless the condition allows it, and only the user can run `/goal clear`
(or `stop`, `off`, `reset`, `none`, `cancel`) to end a goal early. Start a
goal-sdlc run with a condition that has both exits:

```text
/goal Run /dod-guard:goal-sdlc on this repository. The goal is met when either holds: (a) the final report says no eligible parent remains and quotes git status showing a clean default branch; or (b) the user, in their own prompt, has told you to stop, and the in-flight parent is merged, or its branch is pushed with its next step written on the issue. Everything after this sentence is a preference, not part of the check: <models, timestamps, counters>.
```

Keep model, timestamp, and counter preferences in that last sentence, never in
the check. A rule such as "every task runs on Haiku" is false after one
exception, and the goal can then never be met.

During the run, goal-sdlc applies `standards/goal-stop.md`. It shows this
template when the condition has no user-stop exit, and gives the grader the
evidence each exit needs. When the goal keeps firing after the final report,
it says once that only `/goal clear` ends it, then waits on a bounded
background sound command to get your attention.

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
| Tasks | `/refine-backlog-item` | `task-list` record and functional-slice child PBIs when independent delivery warrants them | `Todo` PBI hands every slice and parent task evidence to implementation on one branch and PR. |
| Implementation handoff | `/next-ticket` | Issue task list, issue branch, commits, and verification evidence | A pushed branch can enter draft-PR convergence. |
| Convergence | `/submit-draft-pr` | Draft PR `## Convergence` section and any actionable issue remainder | Review and acceptance remain separate. |

On the structured path, `/next-ticket` leaves one durable `## Implementation
handoff` comment on the parent issue, mapping every declared functional slice,
task, and linked functional-slice child to its commit or verified remote-state
evidence, checks, and user-path result. Each review lens records its canonical
ID, owning slice or parent-level task, observable evidence, accepted head,
`acceptanceEvidence`, and `verificationEvidence`; a childless parent task uses
`parentLevel: "convergence"`. The proof requires exact-once slice, task, child,
and lens mappings, unique owner-resolvable evidence, and stops on malformed,
duplicate, stale, or contradictory evidence.
followed by one `## Acceptance matrix` with exact-head rows for each acceptance
criterion and mandatory user-facing path.
`/submit-draft-pr` compares that handoff with the issue contract and links it
from `## Convergence` instead of copying the mapping; missing, contradicted, or
stale matrix evidence stays an actionable remainder. Small, clear fixes use
the ordinary path instead.

The structured path does not create a parallel local plan. It preserves stops
for material ambiguity, credentials, destructive or authority-bound actions,
unrelated work, provider or head mismatch, and missing high-risk evidence.
OpenSpec is historical reference material only. It is not an active runtime or
dependency.

All GitHub-backed commands follow the shared request policy in
[`standards/github-request-discipline.md`](standards/github-request-discipline.md).

Cross-shell RTK, native-executable, path, output, and precondition commands
follow the repository contract in
[`docs/command-composition.md`](docs/command-composition.md).

Start or continue the Todo PBI from the repository's main checkout. When that
checkout cannot safely retain the selected branch and user-owned changes, the
skill stops and reports the reason and recovery path; it never creates a Git
worktree:

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
5. Maps every acceptance criterion to fresh evidence, then commits and pushes.

An unmet criterion or failed check blocks the implementation commit and push.
The initial branch-only push remains permitted. `/review-pr` is the one
independent review of the pushed work.

## Execute an explicit plan

Use `/step-by-step` with a numbered plan, or name one repository plan file.
Skills such as `next-ticket` also pass it a task list, committing each step.
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

Use the advisor when a fix or design needs independent advice before
implementation. In Claude Code it calls Claude's built-in `advisor` tool after
writing the brief into the conversation; without that tool, and in Codex, it
runs a separate Codex process:

```text
/dod-guard:codex-advisor
```

The Codex path sends a bounded prompt containing fixed advice-only instructions and
the complete problem description through stdin to a separate `codex exec`
process. It uses `gpt-5.6-sol` with `max` reasoning by default and accepts an
optional `--model=<model>` setting. Like the built-in tool, it runs exactly one
turn, read-only, and returns advice only; because it sees nothing but its
prompt, the caller supplies the task, the evidence so far, relevant diffs, and
the candidate decision with its recommended default and the exact question. A
JSONL stream with a tool item, more than one turn, or other than one agent
message fails the run. It uses an
empty non-repository working directory, read-only restrictions, and an
ephemeral session, and tells the advisor to skip repository research and
mutations. It probes the direct executable's version and help before launch;
write-capable review launchers use `--approve-for-me`, while this advisor never
uses approval flags. The runner requests `--json` and treats a matching
`item.completed`/`error` model-metadata fallback event as an incomplete failure
even when the process exits `0` and the final schema response is valid. It
preserves the exact event/message and raw process evidence; unrelated JSON,
banners, malformed lines, and fallback text for another model remain harmless.
Missing commands, non-zero exits, timeouts, and malformed responses remain
visible incomplete failures. The result reports the CLI version, model setting,
reasoning effort, and complete process evidence; the CLI keeps advice on stdout
and emits one JSON execution record on stderr. The caller repairs the runtime
cause and uses the existing incomplete-review retry path; the skill never
switches executables or models automatically. The skill never edits files,
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

Review a GitHub pull request's changed files:

```text
/dod-guard:review-pr
/dod-guard:review-pr https://github.com/owner/repository/pull/42
```

The PR head must be checked out. The skill scans the whole repository with the
installed quality-guard scanner and keeps the findings in changed files. Its
script then generates fixed review slots from the diff and the PBI: one per
changed file with added lines, one per acceptance criterion, and one per
linked sub-issue. A standard planner fills every slot with questions for the
feature, design, reliability, and hygiene lenses or with an exclusion and its
reason, cheap investigators answer each question with a cited path and line,
and after the main thread verifies those answers, the four reviewer agents
judge them on the standard tier against the PBI, ruling on every slot assigned
to their lens. A standard-tier pass then merges findings that cite the same
defect in one file and keeps or drops each scanner finding, citing a verified
answer for every drop, and the build checks its output. The build refuses a
plan or a set of rulings that leaves a slot empty. It posts one comment-only
review, with every slot and its questions in a collapsed block. Each `BLOCKER`
or `MAJOR` finding gets its own inline comment with a `GH-<id>`; kept scanner
findings are grouped into one comment per changed file. `MINOR` findings are
listed under "Minor notes" in the review body, with no `GH-<id>` and no reply
needed. The recommendation is `BLOCK` for any `BLOCKER`, `REQUEST_CHANGES`
for any `MAJOR`, and `APPROVE` when only `MINOR` findings or none remain.
When the diff adds no line, there is nothing to anchor a comment on, so
blocking findings are listed in the review body without a `GH-<id>`. It posts
at most one review per pull request. quality-guard must be installed and enabled.

Fix selected GitHub review findings:

```text
/dod-guard:fix-pr-review #42 GH-12345
```

The skill reloads the parent PBI and linked subtasks, then rechecks each
finding against the current head. It skips resolved or unsupported findings,
and rechecks outdated ones instead of skipping them. It pushes the smallest
verified fix before replying to or resolving GitHub threads.

After review, explicitly accept and complete the current pull request:

```text
/dod-guard:complete-pr 42
```

`complete-pr` accepts either a draft or ready pull request. It records the
accepted head first and marks a draft ready only when needed. It then enables
guarded REST merge, updates a stale base only from the accepted head, waits for
required checks, confirms the merge and linked issue state, and deletes the
unchanged remote head branch. A merge conflict on the PBI head is triaged as
`standards/conflict-triage.md` says: a verified merge commit is pushed and the
command ends with `conflict-triaged`, so the new head goes back through
`/submit-draft-pr` and `/review-pr`. Unresolvable conflicts, failed checks,
permission errors, unexpected pushes, and changed branch refs stop the command.
After the merge it records `## Completion evidence` on each delivered issue and
runs `scripts/closure.mjs` to close the originals that delivery replaces.
Missing, pending, or mismatched evidence is reported as a hold, never closed.

## Release a marketplace change

After the changed plugin has its own manifest version bump and local gates
pass, use:

```text
/dod-guard:publish
```

Use the installed `/dod-guard:publish` entry point; without pins, it verifies
and uses the active client's registered installation. If a run needs an exact
pin, pass `version=<exact-version>` and/or
`path=<absolute-path-to-skills/publish/SKILL.md>` with the invocation. The path
pin is the skill file, not its plugin root. For example:

```text
/dod-guard:publish version=5.4.55 path="<absolute-plugin-root>/skills/publish/SKILL.md"
```

Each supplied pin must match the active registration and installed manifest
exactly. On mismatch, publish stops before release mutations and reports the
requested and detected values instead of silently selecting another copy. No
cache path needs guessing for an unpinned run.

Before any release, protection, checkout/ref, commit, push, or client-cache
mutation, run the source metadata preflight from the repository root:

```text
node scripts/ci/validate-plugins.mjs
```

It checks every shipped code plugin's `package.json`, Claude manifest, Codex
manifest, and present adapter metadata for a valid matching version. A
mismatch, missing or malformed version, or ambiguous source reports every
affected path and observed value, then stops. Correct the tracked metadata and
rerun; publish never synchronizes manifests or waits for a later validator or
client-cache readback to recover the release.

### Windows authentication boundary

Run the complete Windows publish flow from the authenticated interactive
PowerShell session that launched it. Before any GitHub API, protection,
release, commit, push, or post-release verification operation, run this
same-session preflight and check its exit status:

```powershell
gh auth status
$githubAuthStatus = $LASTEXITCODE
if ($githubAuthStatus -ne 0) {
  throw "GitHub CLI authentication failed; stop before release mutations"
}
```

`maintenance-publish.ps1` owns the mutation-side GitHub CLI calls, while
`release-verification.ps1` owns the post-release read-only calls.
`preflight-installation.mjs` only parses local client inventory. Do not invoke
`gh api` through a Node REPL or another unauthenticated nested runtime.

If authentication fails, stop before protection changes, checkout or ref
movement, commit, push, client refresh, or cache mutation. Restore GitHub CLI
authentication through the user's normal authenticated PowerShell session,
rerun the authentication and installation preflights from the start, and do
not continue from partial or failed evidence. Never copy or persist
credentials into another runtime or file.

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

Maintenance publishing stays in the existing primary checkout and does not
run Git worktree commands. The skill verifies the checkout identity with Git
metadata, classifies every pending path, and continues only when all paths are
clearly part of the authorized release. Unrelated, ambiguous, credential-like,
or destructive paths stop the run before checkout/ref movement; the skill does
not stash, reset, overwrite, move, or silently filter user-owned changes. If
Git cannot retain the release paths during the same-checkout transition, it
stops and preserves the starting state.

A successful maintenance result reports the published SHA, the lease SHA, full
protection restoration equality, the restore retry count, required-check status,
and client-refresh status. Missing cleanup or any required evidence is a
failure, not a successful release.

Confirm `codex plugin list` reports the released version. Do not copy files
into either client cache manually.

If the shared MCP host is managed by PM2, restart only its two apps after the
client cache refresh succeeds:

```text
pm2 restart dod-guard-quality-guard dod-guard-knowledge-base --update-env
```

Do not restart them before refresh or restart unrelated PM2 processes.

On Windows PowerShell, after both client refreshes and any host restart, run the checked-in
read-only evidence boundary with the exact release values:

```powershell
. "<skill-dir>/scripts/release-verification.ps1"
$verification = Invoke-ReleaseVerification `
  -Owner '<owner>' `
  -Repo '<repo>' `
  -PublishedSha '<published-sha>' `
  -ExpectedParentSha '<expected-parent-sha>' `
  -ExpectedVersion '<released-version>'
$verification | ConvertTo-Json -Depth 20
if (-not $verification.Success) { throw "Release verification failed at $($verification.Stage)" }
```

This read-only helper verifies the current and remote Git heads, complete
branch protection and `enforce_admins` readbacks, all required checks on the
published SHA, and the refreshed Codex and Claude registrations. In procedure
step 11 it verifies the registered installation of the new release (registered
root, manifest, and publish skill), not the loaded one, so no session reload is
needed; the installation identity preflight before release still verifies the
loaded installation. It captures each command exit status before parsing
output and reports a failed stage instead of presenting partial evidence as a
successful release.

This repository does not publish npm packages or tags.

## Quality dashboard

Run `quality-dashboard.cmd` from this repository root. The dashboard reads each
registered project's `.quality/quality-report.json`; it never runs a scanner or
edits a project.
