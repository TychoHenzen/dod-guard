---
name: review-pr
description: Review a Git branch or GitHub pull request with four independent reviewers and inline findings, or review an Azure DevOps pull request into one Markdown report. Loads the linked PBI and subtasks before judging the implementation.
argument-hint: [current branch, Git ref, GitHub PR URL or #number, or Azure DevOps PR URL or ID] [Azure report path]
---

# Review pull request

Review the final target revision without checking it out or editing it. Git is
the default mode. Azure DevOps is an additional explicit mode.

## Boundaries

- Never switch branches, edit the target, approve, mark ready, merge, or close it.
- Resolve the real default base. Do not assume `main`, `master`, or `origin`.
- Read final files at the resolved head SHA. A historical diff is not final-state evidence.
- Load the parent PBI, acceptance criteria, and linked subtasks before dispatching reviewers.
- Redact credentials before writing context, prompts, comments, or reports.
- A clean review returns no invented findings.

## Normalize the target

Confirm the current directory is a Git worktree. In Claude Code, the skill
directory is `${CLAUDE_PLUGIN_ROOT}/skills/review-pr`. In Codex, use the
directory containing this loaded `SKILL.md`. Resolve the current branch, then
run:

```text
node "<skill-dir>/scripts/review-support.mjs" normalize-target --input "<target argument or empty>" --current-branch "<current branch>"
```

An empty argument means the current branch. Any non-provider value is a named
local or remote Git ref. A GitHub PR URL or `#number` selects GitHub mode. An
Azure DevOps PR URL, numeric ID, or `ado:<id>` selects Azure mode. A bare
numeric ID is Azure-only so GitHub numbers remain explicit.

## Build one review context

Create temporary files outside the repository. Remove them after publication.
Build one JSON context with these fields:

```json
{
  "provider": "git|github|azure",
  "repository": "provider repository identity",
  "pullNumber": null,
  "baseRef": "resolved base revision",
  "targetRef": "resolved target revision",
  "headSha": "immutable final head",
  "changedFiles": [],
  "diffStats": {},
  "diffFile": "absolute path to a unified-zero diff",
  "repositoryInstructions": [],
  "workItem": {},
  "finalFileAccess": "exact read-only command or snapshot path"
}
```

For every mode, record the checkout SHA and `git status --short` before review.
Resolve changed files with the merge-base diff. Save `--unified=0` output for
final-line validation. Load root and applicable nested repository instructions
from the target revision. Record an exact read-only way for reviewers to open
each changed file at `headSha`.

### Git and GitHub

Use `gh repo view --json nameWithOwner,defaultBranchRef,url` when the checkout
has a GitHub repository. Resolve the base from that result. Otherwise use the
remote HEAD of the target's actual remote. Stop if the base is ambiguous.

Resolve local and remote refs with `git rev-parse --verify`. Fetch a requested
remote ref when needed, but never create or switch a branch. For a GitHub PR,
use `gh pr view` and GraphQL to resolve the base, immutable head SHA, head
repository, changed files, closing issues, and linked issue hierarchy. Read
same-repository files with `git show <headSha>:<path>`. Read fork files through
the GitHub Contents API at the exact SHA.

For a local or named Git ref, look for its associated GitHub pull request. If
none exists, extract an issue number only from an unambiguous branch segment
such as `codex/33-name`, then load that issue. Stop and name the missing PBI when
no issue can be resolved. Query `subIssues` through GraphQL. Normalize the
parent and children with `normalize-github-hierarchy`.

### Azure DevOps

Azure mode activates only for an explicit Azure PR URL or ID. Resolve URL
components from the URL. For an ID, derive organization, project, and
repository from the current Azure remote or stop. Use the authenticated Azure
CLI or REST API. Never place a PAT in a command, URL, context, or report.

Load PR source and target refs, immutable last-merge-source SHA, changed files,
diff, linked work-item references, the parent PBI, and hierarchy-forward child
work items. Normalize them with `normalize-azure-hierarchy`. The parent PBI and
every child title, description, state, and acceptance text belong in
`workItem`.

Run `redact-context` on the complete context. Inspect the redacted output and
use only that version in reviewer prompts.

## Dispatch four independent reviewers

Use the active client's subagent facility. Start exactly one fresh instance of
each agent. Use the available concurrency, then start any remaining reviewer
when a slot frees:

1. `review-pr-feature`
2. `review-pr-design`
3. `review-pr-reliability`
4. `review-pr-hygiene`

Give every reviewer the same redacted context and no other reviewer's output.
Each reviewer returns a JSON array. Every finding must have exactly these
fields:

```json
{
  "severity": "BLOCKER|MAJOR|MINOR",
  "file": "final-state path",
  "line": 1,
  "problem": "concrete defect",
  "impact": "observable consequence",
  "requirement": "PBI criterion or subtask, or repository rule",
  "correction": "specific smallest correction",
  "rootCause": "stable deduplication statement",
  "evidence": "final-state evidence"
}
```

`BLOCKER` means exploitable security, data loss, build or deployment failure,
or inaccessible core behavior. `MAJOR` means incorrect or incomplete behavior,
missing effective proof, a race, or a design defect needing rework. `MINOR`
means a concrete non-blocking maintainability defect.

## Validate and deduplicate

Reject malformed or unsupported findings. Re-open the cited file at `headSha`
and verify the evidence. A finding must cite a changed final-state line. Only a
GitHub missing-functionality finding with no honest code owner may use
`"location":"pull-request"` with null file and line.

Run `validate-findings` against the unified-zero diff. Use
`--allow-pr-level true` only for GitHub mode. Combine accepted records and run
`dedupe-findings`. Treat equal `rootCause` values as one defect. Keep the
highest supported severity. Compare existing provider comments and withhold an
already-published root cause.

## Publish findings

Before publication, confirm the provider head still equals `headSha`. Stop if
it changed.

- Local Git: emit each accepted finding through the active client's inline
  code-comment artifact. Number the accepted findings `LOCAL-1`, `LOCAL-2`,
  and so on in their titles so `/fix-pr-review` can select them later. In Codex
  use `::code-comment`; in Claude Code use its clickable `file:line` review
  finding. Do not post externally.
- GitHub: create one `COMMENT` review whose comments use `commit_id=headSha`,
  the validated path, final line, and `side=RIGHT`. Use one PR-level comment
  only for accepted records without an honest line. Never submit `APPROVE` or
  `REQUEST_CHANGES`.
- Azure DevOps: post no inline comments. Run `render-azure` and write one report
  to the requested path, or `review-ado-<pr-id>.md` in the current directory.

When there are no accepted findings, state that no actionable findings were
found. Do not publish an empty GitHub review or Azure inline comment.

Finally, confirm the checkout SHA and status match the values recorded before
review. Report the provider, target, head SHA, PBI, reviewers completed,
findings by severity, publication destination, and unchanged checkout.
