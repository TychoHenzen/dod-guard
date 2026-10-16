---
name: setup-repository
description: >-
  Bootstrap a local project into the dod-guard GitHub workflow. Use when the user wants to create
  or connect its GitHub repository, add applicable correctness gates, link one Project, secure and
  protect the default branch, and leave the intended project state committed and pushed. Preserve
  existing history, remotes, instructions, ignore rules, and tool configuration.
---

# Setup repository

Setup ends with a pushed, protected GitHub repository that `dod-guard:add-backlog-idea`,
`dod-guard:refine-backlog-item`, `dod-guard:next-ticket`, `dod-guard:submit-draft-pr`,
`dod-guard:review-pr`, and `dod-guard:complete-pr` can run against.

Before any call, read `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root. Where this skill is stricter, this skill wins. `standards/project-workflow.md` maps the stages. The existing repository instructions are the project-principles source, so setup adds no second constitution and no planning system of its own.

## Boundaries

What this run may do:

- Make the setup changes described below. Ask one short question only when the repository identity is missing or two existing states contradict each other.
- Treat history, remotes, ignore rules, workflows, instruction files, lockfiles, and tool configuration as inputs to merge. Working state stays, even if that leaves the project less uniform.
- Work in a dirty tree. A dirty worktree is allowed because setup may be the first commit. Commit only reviewed setup paths and leave unrelated pending edits alone.

What it must never do:

- change application behavior or pay down existing code debt
- rewrite history or force-push
- weaken protection or install global plugins
- accept a non-GitHub remote
- swap an already-chosen formatter, linter, test runner, package manager, or build tool
- claim success for a GitHub plan feature that is unavailable; stop and report the exact API result

Bookkeeping: after the first write, keep a ledger of every local and GitHub mutation. If something fails, report what completed, which operation failed, and what state remains. Do not roll back.

Visibility: this skill creates public repositories only. Send `private: false` explicitly. Never infer it, omit it, override it, or ask the user to choose. An existing remote keeps whatever visibility it has. Do not make an existing private repository public as part of setup.

## 1. Inventory before mutation

In Claude Code the skill directory is `${CLAUDE_PLUGIN_ROOT}/skills/setup-repository`. In Codex it is the directory that holds the loaded SKILL.md. This text calls it `<skill-dir>`.

Start with the summary form:

```text
node <skill-dir>/scripts/inspect-repository.mjs --summary <project-root>
```

It reports only the project root, compact Git state, and fixed inventory counts. It leaves out per-file arrays and credential values. Full mode remains required for `credentialFindings`, staged-file review, and any other step that needs per-file evidence.

```text
node <skill-dir>/scripts/inspect-repository.mjs <project-root>
```

Neither form changes anything. Then collect:

- Git: tracked, modified, staged, and untracked files (if a worktree exists); commits, branches, remotes, upstreams, tags, the configured default branch
- instructions: every file that governs a path setup may touch
- tooling: manifests, lockfiles, workflows, ignore files, quality-tool config
- source extensions, ignoring generated, fixture, archive, dependency, and vendored directories

Neither stage nor initialize Git here. Sort files into intended project files, generated output, local secrets, and unrelated work. Ask for a scope decision only if the sort cannot be made safely.

Confirm the GitHub MCP identity can reach the repository, Project, and workflows. With no MCP, run `gh auth status`. A missing login or scope stops setup.

## 2. Resolve repository identity

### Existing GitHub remote

Read the repository through MCP, or run `gh repo view --json nameWithOwner,defaultBranchRef,url,visibility`. Compare the result with the real fetch and push URLs. `nameWithOwner` is the identity.

| Situation | Action |
|---|---|
| `origin` names a different repository | stop |
| Verified GitHub remote under another name, no `origin` | add `origin` with the same URL |
| A required remote is not GitHub | stop |
| Anything else | keep all remotes, the default branch, and the history; rename nothing |

### No GitHub remote

Settle three values, inferring only what is unambiguous: owner (the authenticated user), repository name (the directory name, if valid and unused), and default branch (the current unborn branch). Confirm `owner/name` is free. Run `git init` with that branch only when the directory is not yet a worktree.

Create the repository with no push. The payload is below, and MCP spells the last key `autoInit`. Add `organization` only when the owner is an organization.

```json
{ "name": "<name>", "private": false, "auto_init": false }
```

Use `scripts/repository-visibility.mjs` for the call. It reads before creation, mutates only an absent target, records the attempted mutation, reads back after the mutation, and fails closed on a missing, contradictory, or failed response. After a failed or ambiguous create, read the target back once before any retry, and keep the raw provider error out of diagnostics.

Record success only when the readback shows the resolved owner and name, `private: false`, and `visibility: "public"`. Next add `origin` (never replacing a remote), query again, and check owner, name, public visibility, remote URL, and default branch.

Do not add `origin`, push, link a Project, enable security, or protect a branch after a failed public-visibility readback. Do not push at all until step 6 passes.

## 3. Build the local setup from existing choices

Begin with the applicability table: one row per maintained language, with manifests, lockfiles, source, and existing commands as evidence.

```text
language | evidence | format | lint | type | test | coverage | dependency | CodeQL | reason skipped
```

Generated files, vendored code, archives, snapshots, and test fixtures are not maintained languages. The inspector still lists and credential-scans them, but it drops the path segments `generated`, `fixture(s)`, `archive(s)`, `dependency/dependencies`, `deps`, `snapshot(s)`, and `test-fixtures` from language detection.

### Choosing each gate

For every applicable category, take the first that fits: the project's strict stable native tool; an existing script or config that really enforces the category; the smallest new repo-local config or dependency.

- Pin tools in the manifest and the lockfile.
- Pin each GitHub Action to a full commit SHA and note the release tag in a comment.
- CI formatter commands only check. CI must not write formatting, generated files, lockfiles, or persisted quality state.
- A skipped category needs a concrete language, platform, manifest, or tool-conflict reason. "Not configured" does not count.
- Skip type checking only when the language has no meaningful static check here. Skip CodeQL only when GitHub does not support the language.
- One actionlint job covers workflow syntax and embedded shell.
- Dependency checks follow the project's ecosystem and fail on actionable vulnerabilities.

### Workflow files

Build them from the commands you detected. Give jobs stable, unique names. Set minimal top-level permissions and raise them per job: `security-events: write` for CodeQL, read-only contents for build and test. Where the tool allows exclusions, leave generated, fixture, archive, dependency, and vendored paths out.

### The `quality-guard` job

Any repository with maintained source gets a `quality-guard` job. It runs on `pull_request` only, checks out with `fetch-depth: 0`, and runs:

```text
node <dod-guard-checkout>/packages/quality-guard/skills/quality-refactor/scripts/quality-pr-gate.mjs --base=<base sha> --root=<source root>
```

The gate compares the PR-changed files at the merge base and at HEAD. It fails if the PR adds a medium or high finding, or if it removes fewer than one medium or high finding (three low) from those files. Findings already present are listed in the report only, so diagnostic output remains visible.

Options:

- `--report=<file>`: upload as a build artifact
- `--comment=<file>` plus `--report-link=<run url>`: keep one gate comment per PR, posted by `quality-pr-gate-comment.mjs --repo=<owner/name> --pr=<number> --body=<file>`; that job needs `pull-requests: write`
- `--block-on` and `--rule-block-on=<rule>:<severity>`: adjust limits

Check out dod-guard at a pinned commit next to the project. Do not copy the scanner and do not register a quality-guard PostToolUse hook. Step 9 makes this job a required check.

Run each generated command locally before trusting its workflow form. If a strict applicable check turns up old debt, stop; do not loosen the check or fix unrelated code. Quality output is diagnostic, and the correctness checks stay in charge.

## 4. Merge ignore rules and repository instructions

Add any missing `.gitignore` entries for build output, caches, editor state, local credentials, and OS files, and keep the patterns and comments already there. Once Git exists, test each new pattern against representative paths with `git check-ignore -v`. It must not hide source, manifests, lockfiles, tests, fixtures, workflows, or repository instructions.

Pick the canonical instruction file and merge in one short section, leaving existing guidance alone. When `AGENTS.md` and `CLAUDE.md` each hold unique guidance, keep both. Shared workflow text goes in the canonical file; use imports only if the repository already does. The section names the skills:

| Skill | Role |
|---|---|
| `dod-guard:add-backlog-idea` | puts ideas into the linked Project as Backlog issues |
| `dod-guard:refine-backlog-item` | makes a Todo PBI and writes its step plans |
| `dod-guard:next-ticket` | implements and pushes one issue branch |
| `dod-guard:submit-draft-pr` | creates its draft pull request |
| `dod-guard:review-pr` | reviews it, read-only until explicit acceptance |
| `dod-guard:complete-pr` | alone owns ready, merge, issue confirmation, and branch deletion |

## 5. Resolve one linked GitHub Project and common labels

Ask the repository which Project is linked:

```text
node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>
```

Act on what it reports:

- `several` (exit 1): stop and list each owner, number, and title from its `projects`.
- `resolved` (exit 0): preserve that Project and merge the required status options.
- `none` (exit 1): create one under the resolved repository owner, link it with `gh project link`, and rerun the command as the readback; it must report `resolved`.
- Exit 2: stop with its message.

Finding a Project by owner or title alone does not prove it is linked.

The finished Project holds one `Status` field, and that field has exactly one option, matched without regard to case, for each of `Backlog`, `Todo`, `In Progress`, and `Done`. Read fields and options through the typed connector or the REST ProjectsV2 field endpoints.

- Empty new Project: swap out the unused default Status field if necessary and create a single-select Status with the four options.
- Existing Project: never delete a field that holds data. Through the supported REST field update or the typed connector, add or rename only the options required, and keep each existing option's id, name, color, and description. If duplicate statuses cannot merge without changing what an item means, stop.

After the Status options are created or merged, re-query the Project through the repository link with the command above. A Project found only by owner or title is not proof it is linked.

### Establish the common workflow labels

The canonical shared taxonomy is `<skill-dir>/scripts/workflow-labels.json`. Read every live label with its name, description, and color, plus that catalog. Through the repository labels REST endpoint, create each missing catalog label and normalize the description and color of each existing one.

Preserve every label outside that exact catalog: no deletes, renames, or edits. Read all labels again afterward. Each catalog label must carry the exact canonical metadata, and each preserved label must be unchanged. If the readback fails, stop and do not say the taxonomy exists.

## 6. Review credentials and staged content

Run the full inspector again once local edits are done. A `credentialFindings` entry blocks staging until you have reviewed the file and the exact signal. Never print a matched value. Summary mode is not a substitute for this per-file credential evidence.

Beyond the inspector:

- read through the whole tracked and untracked file list
- run the repository's own secret scanner if there is one
- before the first push, look for private keys, tokens, credentials, `.env` files, connection strings, and high-entropy values
- keep any example or fixture secret plainly fake

Read the full diff. Stage named, reviewed paths only; `git add .`, `git add -A`, globs, and the repository root are forbidden. What may be staged:

- no commits yet: the intended project files
- existing history: setup files and nothing else
- never: generated output, a local env file, a credential, an archive, or an unrelated edit

## 7. Commit, push, and prove the generated checks

With no commits, make one initial commit. Otherwise commit only the reviewed setup changes, through the repository's commit workflow if it has one. Push without force and make `origin/<default>` the upstream. Before moving on, confirm origin, local branch, upstream, remote default branch, last commit, and a clean worktree.

Wait for all workflows on the pushed commit and query both workflow runs and check runs. Queued, skipped, cancelled, neutral, stale, or missing required jobs are not successes. If a workflow fails, name the job and stop short of branch protection. Required check names come from this commit's successful check runs, matched against the generated stable job names, never from another repository.

## 8. Enable security before protection

Use the current repository REST API and query again after every change. Turn on each supported item: dependency graph, Dependabot alerts and security updates, secret scanning, push protection, and CodeQL (a committed workflow or a compatible current config). A successful HTTP status proves nothing; read the security state and confirm every supported feature is on. When the plan, visibility, owner type, or an API limit blocks a required setting, record the exact response and stop.

## 9. Protect the observed default branch

Save a snapshot outside the project, shaped exactly like this:

```json
{
  "projects": [{ "closed": false, "statusOptions": ["Backlog", "Todo", "In Progress", "Done"] }],
  "checks": [{ "name": "observed job name", "conclusion": "SUCCESS" }]
}
```

```text
node <skill-dir>/scripts/inspect-repository.mjs --github-snapshot <snapshot.json>
```

Go on only when `readyForProtection` is true. A malformed or incomplete snapshot is a blocker and yields no payload. Send its `protectionPayload` to the branch protection REST endpoint for the resolved default branch, leaving generated check names untouched. Then query again and confirm these outcomes:

- pull requests are required
- required status checks are strict and list every observed generated check; add `quality-guard` when it was generated (it runs only on PRs, so the default-branch snapshot lacks it; require it by name once a PR has run it green)
- the rules apply to administrators
- `required_approving_review_count` is explicitly `0` for a solo owner who cannot self-approve; zero approvals does not bypass the workflow's independent review or exact-current-head required-check gate
- force pushes and branch deletion are disabled

When verified, delete the snapshot file and nothing else. Never delete the repository or the Project.

## Result

Final report contents:

- local path, repository URL, default branch, pushed commit, and evidence of a clean worktree
- visibility: public for a repository this run created, the preserved visibility for an existing remote
- the linked Project and its status options
- shared labels and the preserved repository-specific labels
- the applicability table, each skipped check with its concrete reason, and the checks that passed
- security settings and protection settings, including zero approvals for a solo owner

Say that independent review and exact-current-head required checks still gate delivery. After a partial failure, open with the failed operation, then list every completed mutation and the exact state left. Do not report completion while any required proof is missing.
