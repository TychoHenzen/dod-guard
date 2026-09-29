# dod-guard

A code-free plugin for GitHub issue delivery and focused repository
maintenance.

## OpenCode

The adapter supports OpenCode v2.0.18 and can load directly from this directory:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./plugins/dod-guard"]
}
```

The adapter registers the existing `skills/` and `agents/` Markdown files at
load time. It does not copy or maintain a second source tree.

### Install and reload

For a local checkout, add the plugin directory to the project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/dod-guard/plugins/dod-guard"]
}
```

Start OpenCode from that project, then verify the resolved config and active
plugin with `opencode debug config` and `opencode plugin list`. Upgrade a local
install with `git pull` in the checkout; package installs can use
`opencode plugin update` (local paths and exact revisions are not updated by
that command). Run `opencode reload` after config edits, and
`opencode service restart` if an unchanged local path still has stale content.

If loading fails, confirm the entry points to the adapter directory (not a
copied skill cache), rerun `opencode debug config`, and inspect
`opencode plugin check`. If `opencode.json` is missing, create it with the
plugin entry shown above; if it is malformed, replace it with valid JSON and
the same entry. Run `opencode reload --server <url>` after either repair, or
restart the service when no server URL is available. OpenCode should show no
active dod-guard registration until the configuration is valid. The adapter
reads the checkout's existing skills and agents directly, so Claude and Codex
paths remain untouched.

### Disposable discovery proof

Run the runtime check with OpenCode v2.0.18 available on `PATH`:

```text
node --test plugins/dod-guard/opencode-discovery.test.mjs
```

Set `OPENCODE_BIN` to the executable path when OpenCode is installed outside
`PATH`. The test reports the install or configuration fix when the executable
is missing.

The test creates a temporary project and isolated config/data directories,
checks `opencode v2.0.18`, verifies plugin list/check output, activates the
`next-ticket` skill, and confirms the `review-pr-feature` agent. It removes the
fixture afterward and does not edit `PATH` or the user's OpenCode config.

Every skill applies the shared working defaults in
`standards/working-defaults.md`: clear low-risk choices proceed, ordinary
dirty worktree changes use the normal commit path, stale tests follow the
current contract, and explicit safety or authority boundaries remain.

## Repository setup

`/setup-repository` connects a local project to GitHub, merges applicable
quality gates and delivery instructions, links one Project, enables supported
security settings, and protects the observed default branch after its checks
pass. It preserves existing Git history, remotes, instructions, ignore rules,
and tool configuration. Setup establishes the shared workflow labels while
preserving repository-specific labels, and uses explicit zero required approvals
for a solo owner without bypassing review or current-head checks.

## Delivery workflow

`/add-backlog-idea` splits a brain dump into independently deliverable Backlog
issues. `/refine-backlog-item` researches one, triages missing user constraints
and external context, uses interview for interactive refinement or one fresh
`gpt-5.6-luna` advisor at max reasoning effort for an active goal or explicitly
non-interactive run, and uses targeted research or debate only when their
prerequisites are known. It then assigns justified priority, Fibonacci effort,
and standard labels before moving a coherent,
independently deliverable PBI to Todo. Material unresolved requirements keep
the issue in Backlog. Epics stay there until split into independently
deliverable PBIs. `/next-ticket`
implements that PBI, maps every acceptance criterion to fresh evidence, and
commits and pushes. `/submit-draft-pr` submits its verified draft pull
request. `/review-pr` is the one independent review: it splits the change
into units, reviews each at medium effort with 1-4 angles chosen by the kind
of code, and runs one PR-level feature pass. After review, `/complete-pr` treats its invocation as
acceptance of the current head and completes the guarded merge.
`/fix-pr-review` revalidates and fixes selected review findings before that
acceptance. Each delivery skill resolves the current repository and requires
exactly one open GitHub Project explicitly linked to it.

`/quick-pbi` runs those delivery stages in order for a user request. It asks
questions only when `/refine-backlog-item` needs material clarification.

Ordinary provider, stale-state, test, or runtime failures keep their original
checkpoint: the skill reads back uncertain writes, makes the smallest reversible
repair, proves it narrowly, and resumes. It retries one identical transient
failure at most once. Credentials, authority, destructive actions, provider or
head mismatches, and missing required evidence remain stop conditions.

One issue becomes one branch and one draft pull request:

```text
backlog idea -> research and discovery -> coherent Todo PBI -> codex/<issue>-<slug> -> verified commits -> draft PR -> accepted merge
```

The issue holds the requested outcome and acceptance sub-issues. The branch
holds implementation. The pull request holds the result and verification. A
human review followed by `/complete-pr` is the explicit acceptance boundary.

For feature work or material ambiguity, use the structured path in the
[`standards/project-workflow.md`](standards/project-workflow.md):

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

For structured work, `/next-ticket` records one `## Implementation handoff`
comment on the parent issue. It maps each ordered task and mandatory child to
the pushed commit or verified remote-state evidence, fresh checks, and the
current user-path result. `/submit-draft-pr` checks that comment against the
issue contract and links it from `## Convergence` instead of restating it;
missing or contradicted evidence remains an actionable remainder. Small, clear
fixes bypass these records.

Use the ordinary path for a small, clear fix. Neither path bypasses stops for
material ambiguity, credentials, destructive or authority-bound actions,
unrelated work, provider or head mismatch, or missing high-risk evidence.
OpenSpec references remain historical only.

GitHub-backed skills share the request policy in
[`standards/github-request-discipline.md`](standards/github-request-discipline.md).

## Skills

| Skill | Purpose |
|---|---|
| `/setup-repository` | Bootstrap a local project into the protected dod-guard GitHub workflow. |
| `/add-backlog-idea` | Capture each independently deliverable feature as a Backlog issue. |
| `/quick-pbi` | Run backlog capture through guarded merge without extra prompts outside refinement. |
| `/refine-backlog-item` | Deliberatively refine a Backlog issue, moving it to Todo only when its PBI is coherent and independently deliverable. |
| `/next-ticket` | Execute a Todo PBI through verified, pushed commits. |
| `/learn-repository` | Learn one repository concept at a time from current source evidence. |
| `/teach-back` | Explain a repository concept while a curious student tests the explanation. |
| `/step-by-step` | Run one explicit ordered plan through fresh bounded subagents. |
| `/submit-draft-pr` | Create or update the PBI's verified draft pull request. |
| `/review-pr` | Review Git or GitHub inline with four agents, or produce one Azure DevOps report. |
| `/fix-pr-review` | Revalidate and fix selected GitHub, local Git, or Azure review findings. |
| `/complete-pr` | Complete an explicitly accepted draft through guarded REST merge and branch deletion. |
| `/publish` | Release a changed marketplace plugin through merge, CI, and cache refresh. |
| `/clean-house` | Find and remove obsolete or duplicate implementations. |
| `/codex-advisor` | Get a bounded advice-only second opinion from a separate Codex process. |
| `/codex-migrate` | Adapt Claude-oriented repository instructions for Codex. |
| `/doc-reconcile` | Resolve contradictory documentation using Git history. |
| `/skill-debug` | Compare skill instructions with recorded executions. |
| `/skill-migrate` | Migrate agent instruction artifacts for current models. |
| `/wiring-audit` | Check whether a feature reaches its intended user through the repository's real surfaces. |
| `/usability-review` | Review user-facing workflows for usability, accessibility, and AI trust cues. |

`review-pr-feature`, `review-pr-design`, `review-pr-reliability`, and
`review-pr-hygiene` provide the independent review angles. The coordinator
validates final-state lines and removes duplicate root causes before publishing
comments. The plugin has no MCP server or runtime bundle.
