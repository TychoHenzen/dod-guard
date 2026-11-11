# Next-ticket resume and worker fixtures

These are manual behavioral fixtures for the instruction-only parts of the
skill, plus the `resume-state.mjs` command they call. Run the skill against each
situation and compare its decisions and mutations with the expected result. Use
a disposable issue and branch for GitHub writes. Record observed results
separately from these expectations.

## Shared setup

The issue is open and In Progress. The branch `codex/<issue>-<slug>` exists on
origin. The author login is the authenticated user. Tip date is the committer
date of `origin/<branch>`. Ahead is the commit count of
`origin/<default>..origin/<branch>`.

## Resume classification

| Case | Input | Expected `resume-state.mjs` output | Expected skill action |
|---|---|---|---|
| Live handoff | The newest handoff by the author lists a matrix row whose `headSha` is a prefix of the tip. Step plans may also exist. | `live-handoff` | Stop `resume-live-handoff`. Report that `dod-guard:submit-draft-pr` owns the issue. Change nothing. |
| Handoff at an older head | The handoff names a commit that is not the tip. | `resumable` | Continue on the branch. |
| Superseded | Task plan 5 predates the tip and plan 6 for the same task postdates it. Ahead is 3. | `superseded`, reason names comment 6 | Post one `## Superseded branch` comment with the `Branch:` and `Reason:` lines and read it back. Restore the default branch tree, confirm `git diff --quiet origin/<default>` exits 0, commit the restart, push. Delete, reset, and force-push nothing. |
| First plan for a missing task | Only one plan exists for a task, dated after the tip. | `resumable` | Continue. A first plan is not a replacement. |
| No work on the branch | A replacement plan postdates the tip and ahead is 0. | `resumable` | Continue. There is nothing to supersede. |
| Replacement by a stranger | The newer plan comes from a login with association NONE. | `resumable` | Continue. Only the author or an OWNER, MEMBER, or COLLABORATOR counts. |
| Restart rerun | The superseded case, after the restart commit is pushed. | `resumable` | Continue. The restart commit postdates every plan, so the next resume does not restart again. |
| Dirty restart | The restore leaves a difference from the default branch. | not applicable | Stop `restart-not-clean` and report. Commit nothing. |
| Usage error | `--ahead=-1`, or a comments file that is not a JSON array. | exit 2 with the usage line | Report the failure. Do not guess a state. |

## Worker identity

| Case | Input | Expected result |
|---|---|---|
| Own worker listed | `ListAgents` shows the worker dispatched for task-2 and no other agent. | The owner matches it by task id and continues. It does not treat the shared sender address as a second writer. |
| Dispatcher listed | `ListAgents` shows the owner's dispatcher and the owner. | Neither counts as a peer. Work continues with exclusive write access. |
| Unexplained writer | `ListAgents` shows a running agent that is neither the owner, its dispatcher, nor a worker dispatched for a task. | Report that agent by id to the dispatcher. Change nothing. |
| Stale background wait | An agent reports that it waits on its own background work. | Treat it as live. List running agents, stop it with `TaskStop`, confirm it is gone, then dispatch a replacement. |
