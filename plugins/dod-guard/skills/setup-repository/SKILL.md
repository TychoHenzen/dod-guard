---
name: setup-repository
description: >-
  Bootstrap a local project into the dod-guard GitHub workflow. Use when the user wants to create
  or connect its GitHub repository, add applicable quality gates, link one Project, secure and
  protect the default branch, and leave the intended project state committed and pushed. Preserve
  existing history, remotes, instructions, ignore rules, and tool configuration.
---

# Setup repository

Turn the current local project into a clean, pushed GitHub repository that can use
`/add-backlog-idea`, `/refine-backlog-item`, `/next-ticket`, `/submit-draft-pr`, review, and
`/complete-pr`.

This invocation authorizes the setup changes described below. Ask only when required repository
identity is missing or existing state has incompatible meanings. Never replace working state merely
to make setup uniform.

## Boundaries

- Preserve Git history, configured remotes, `.gitignore`, workflows, instruction files, lockfiles,
  and tool configuration. Treat them as merge inputs.
- Do not change application behavior, clean existing code debt, rewrite history, force-push,
  weaken protection, install global plugins, or support a non-GitHub remote.
- Do not silently enable a different formatter, linter, test runner, package manager, or build tool
  when the project already chose one.
- Do not claim an unavailable GitHub plan feature succeeded. Stop and report the exact API result.
- Keep a mutation ledger after the first write. On failure, report completed local and GitHub
  mutations, the failed operation, and the state left behind. Do not roll back automatically.

## 1. Inventory before mutation

Resolve the skill directory. In Claude Code it is
`${CLAUDE_PLUGIN_ROOT}/skills/setup-repository`. In Codex, use the directory containing this loaded
`SKILL.md`.

Run the read-only inspector against the local project root:

```text
node <skill-dir>/scripts/inspect-repository.mjs <project-root>
```

Also inspect:

- tracked, modified, staged, and untracked files with Git when a worktree exists;
- existing commits, branches, remotes, upstreams, tags, and the configured default branch;
- every instruction file that applies to files setup may change;
- every manifest, lockfile, workflow, ignore file, and quality-tool configuration;
- source extensions outside generated, fixture, archive, dependency, and vendored directories.

Do not stage or initialize Git yet. A dirty worktree is allowed because setup may be the first
commit. Separate intended project files from generated files, local secrets, and unrelated work.
Stop for one concise scope decision only when those groups cannot be distinguished safely.

Run `gh auth status`. Required scopes are `repo`, `project`, and `workflow`. Stop if authentication
or a required scope is missing.

## 2. Resolve repository identity

### Existing GitHub remote

Use `gh repo view --json nameWithOwner,defaultBranchRef,url,visibility` from the project. Verify the
result against the actual fetch and push URLs. Use `nameWithOwner` as repository identity.

- Keep every existing remote.
- If `origin` already names a different repository, stop. Do not replace it.
- If the verified GitHub remote has another name and `origin` is absent, add `origin` with the same
  URL.
- If any required remote is non-GitHub, stop because that target is unsupported.
- Preserve the existing default branch and history. Do not rename either during setup.

### No GitHub remote

Before creating anything, collect or infer all four values: GitHub owner, repository name,
visibility, and default branch.

Infer only an unambiguous value. The active authenticated user can supply the owner. The directory
name can supply the repository name when it is valid and unused. A current unborn Git branch can
supply the default branch. Visibility cannot be inferred. Ask once for all missing values.

Check that `owner/name` does not already exist. Then:

1. Initialize Git with the chosen default branch only when the project is not already a worktree.
2. Create the GitHub repository without pushing.
3. Add `origin` without replacing any remote.
4. Query the repository again and verify owner, name, visibility, remote URL, and default branch.

Do not push until the credential and staged-file review in section 6 passes.

## 3. Build the local setup from existing choices

Create an applicability table with one row per maintained language and these columns:

```text
language | evidence | format | lint | type | test | coverage | dependency | CodeQL | reason skipped
```

Use manifests, lockfiles, source files, and existing commands as evidence. Do not classify generated
files, vendored code, archives, snapshots, or test fixtures as maintained languages.

For each applicable category:

- Prefer the strict stable native tool already selected by the project.
- Prefer existing scripts and configuration when they actually enforce the category.
- Add the smallest repository-local configuration or dependency needed when the category is absent.
- Pin tools in a manifest and lockfile. Pin every GitHub Action to a full commit SHA and retain the
  release tag in a comment.
- Use check-only formatter commands in CI. CI must not write formatting, generated files, lockfiles,
  or ratchet baselines.
- Record a concrete language, platform, manifest, or tool-conflict reason for every skipped category.
  "Not configured" is not a reason.

Type checking is inapplicable only when the maintained language has no meaningful static type check
for this project. CodeQL is inapplicable only when GitHub does not support the maintained language.
One actionlint job covers GitHub workflow syntax and embedded shell. Dependency checks must use the
project's package ecosystem and fail on actionable vulnerable dependencies.

Generate workflow jobs from the detected project commands. Give each job a stable unique name. Use
minimal top-level permissions and raise permissions only on the job that needs them. CodeQL needs
`security-events: write`; ordinary build and test jobs need read-only contents. Exclude generated,
fixture, archive, dependency, and vendored paths from maintained-source analysis where each tool
supports exclusions.

Run every generated command locally before accepting its workflow form. If a strict applicable
check exposes existing debt, stop. Setup does not weaken the check or fix unrelated debt.

## 4. Merge ignore rules and repository instructions

Merge missing `.gitignore` entries for detected build outputs, caches, editor state, local
credentials, and OS files. Preserve existing patterns and comments. Before keeping a new pattern,
verify it does not hide intended source, manifests, lockfiles, tests, fixtures, workflows, or
repository instructions. Use `git check-ignore -v` on representative paths after Git exists.

Find the repository's canonical instruction file. Merge one concise section without replacing
existing guidance. It must state:

- ideas enter the linked Project through `/add-backlog-idea` as Backlog issues;
- `/refine-backlog-item` makes a Todo PBI;
- `/next-ticket` implements and pushes one issue branch;
- `/submit-draft-pr` creates its draft pull request;
- review is read-only until explicit acceptance;
- `/complete-pr` alone owns ready, merge, issue confirmation, and branch deletion.

If both `AGENTS.md` and `CLAUDE.md` contain unique guidance, preserve both. Keep shared workflow text
in the canonical file and use an existing import convention only when the repository already uses
one.

## 5. Resolve one linked GitHub Project

Query the repository's `projectsV2` connection. Request project id, number, title, closed state,
owner login, fields, and single-select options. Keep only open projects explicitly linked to this
repository.

- More than one open linked Project: stop and list each owner, number, and title.
- One open linked Project: preserve it and merge the required status options.
- No open linked Project: create one under the resolved repository owner and link it with
  `gh project link`.

The final Project must contain exactly one `Status` field and exactly one case-insensitive option for
each of `Backlog`, `Todo`, `In Progress`, and `Done`.

For a new empty Project, replace its unused default Status field when necessary and create one
single-select Status field with all four options. For an existing Project, never delete a populated
field. Use the current `updateProjectV2Field` GraphQL mutation to preserve every existing option id,
name, color, and description while adding or renaming only what is required. Stop if duplicate
statuses cannot be merged without changing item meaning.

Re-query through the repository link. A Project found only by owner or title is not proof that it is
linked.

## 6. Review credentials and staged content

Run the inspector again after local edits. Any `credentialFindings` entry blocks staging until the
file and exact signal are reviewed. Never print the matched value.

Also inspect the complete tracked and untracked file list and run a repository-local secret scanner
when one is already configured. Before the first push, inspect likely private keys, tokens,
credentials, `.env` files, connection strings, and high-entropy values. Examples and fixtures must
use unmistakably fake values.

Review the complete diff. Stage explicit reviewed paths only. Never use `git add .`, `git add -A`, a
glob, or a repository root. Confirm the staged set contains:

- intended project files for a repository with no commits;
- setup files only for an existing history;
- no generated output, local environment file, credential, archive, or unrelated edit.

## 7. Commit, push, and prove the generated checks

Create one initial commit when no commit exists. Otherwise commit only the reviewed setup changes.
Use the repository's commit workflow when one exists. Push without force and set `origin/<default>`
as the upstream.

Verify `origin`, the local branch, upstream, remote default branch, last commit, and worktree state.
The local worktree must be clean before continuing.

Wait for every workflow on the pushed commit. Query both workflow runs and check runs. A queued,
skipped, cancelled, neutral, stale, or missing required job is not success. If a workflow fails,
report its exact job and stop before branch protection.

Resolve required check names from successful check runs on this commit. Match them to the stable job
names in the generated workflows. Do not copy job names from another repository.

## 8. Enable security before protection

Use the current repository REST API and re-query after each mutation. Enable every supported item:

- dependency graph;
- Dependabot alerts and security updates;
- secret scanning;
- secret scanning push protection;
- CodeQL through the committed workflow or a compatible current GitHub configuration.

Do not treat an HTTP success alone as proof. Read the repository security state and confirm each
supported feature reports enabled. If a plan, visibility, owner type, or API limitation makes a
required setting unavailable, record the exact response and stop instead of claiming completion.

## 9. Protect the observed default branch

Write a temporary JSON snapshot outside the project with only:

```json
{
  "projects": [{ "closed": false, "statusOptions": ["Backlog", "Todo", "In Progress", "Done"] }],
  "checks": [{ "name": "observed job name", "conclusion": "SUCCESS" }]
}
```

Run:

```text
node <skill-dir>/scripts/inspect-repository.mjs --github-snapshot <snapshot.json>
```

Proceed only when `readyForProtection` is true. Use its `protectionPayload` with the current branch
protection REST endpoint for the resolved default branch. Do not edit the generated check names.

Re-query protection and confirm all of these exact outcomes:

- pull requests are required;
- required status checks are strict and contain every observed generated check;
- protection applies to administrators;
- force pushes are disabled;
- branch deletion is disabled.

Delete only the temporary snapshot after verification. Do not delete the repository or Project.

## Result

Report the local path, repository URL, default branch, pushed commit, linked Project, status options,
applicability table, successful checks, security settings, protection settings, and clean worktree
evidence. Include every skipped check with its concrete reason.

On partial failure, lead with the failed operation. Then list every completed mutation and the exact
remaining state. Do not report setup complete while any required proof is absent.
