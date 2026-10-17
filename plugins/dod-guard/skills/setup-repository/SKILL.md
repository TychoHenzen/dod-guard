---
name: setup-repository
description: >-
  Bootstrap a local project into the dod-guard GitHub workflow. Use when the user wants to create
  or connect its GitHub repository, add applicable correctness gates, link one Project, secure and
  protect the default branch, and leave the intended project state committed and pushed. Preserve
  existing history, remotes, instructions, ignore rules, and tool configuration.
---

# Setup repository

Turn the local project into a pushed GitHub repository that works with the six workflow skills (section 4). Read and apply `standards/working-defaults.md` and `standards/github-request-discipline.md` (plugin root). Where this skill is stricter, it wins.

## Rules

- `AGENTS.md` and `CLAUDE.md` are the source of project principles. Keep both when each has unique guidance. Add no second constitution or planning system.
- Invocation authorizes the setup changes. Ask only when required repository identity is missing or existing state has incompatible meanings. Never replace working state to make setup uniform.
- Treat history, remotes, `.gitignore`, workflows, instruction files, lockfiles, and tool config as merge inputs. Keep the project's formatter, linter, test runner, package manager, and build tool.
- Never change app behavior, clean existing debt, rewrite history, force-push, weaken protection, install global plugins, or accept a non-GitHub remote.
- A repository this skill creates is public: send `private: false` explicitly, never infer, omit, or override it, and never ask about visibility. An existing remote keeps its visibility; never make a private repository public.
- Read state back after every mutation. Never claim an unavailable plan feature worked; stop and report the exact API result.
- After the first write, keep a mutation ledger. On failure report completed local and GitHub mutations, the failed operation, and leftover state. Never roll back automatically.

## 1. Inventory

Resolve the skill directory first: `${CLAUDE_PLUGIN_ROOT}/skills/setup-repository` in Claude Code, the directory holding the loaded `SKILL.md` in Codex.

```text
node <skill-dir>/scripts/inspect-repository.mjs --summary <project-root>
node <skill-dir>/scripts/inspect-repository.mjs <project-root>
```

Summary mode suits routine checks. Use full mode for `credentialFindings`, staged-file review, and any per-file evidence. Neither mode changes GitHub state.

Also inspect file state (when a worktree exists), commits, branches, remotes, upstreams, tags, instruction files, manifests, lockfiles, workflows, ignore files, quality-tool config, and maintained source. Do not stage or init Git yet. A dirty worktree is fine. Separate intended files from generated files, secrets, and unrelated work, and stop for one scope decision only if you cannot.

Verify GitHub MCP identity and repository, Project, and workflow access, falling back to `gh auth status`. Stop if auth or a scope is missing.

## 2. Identity

With a GitHub remote, read metadata through MCP, else `gh repo view --json nameWithOwner,defaultBranchRef,url,visibility`. Check it against the fetch and push URLs. `nameWithOwner` is the identity. Keep every remote, the default branch, and history. If `origin` names a different repository, stop. If the verified remote has another name and `origin` is absent, add `origin` with the same URL. If any required remote is not GitHub, stop.

Without one:

1. Settle owner, name, and default branch before creating anything. Infer only unambiguous values.
2. Check that owner/name is free. Init Git with that default branch, only if the project is not a worktree.
3. Create the repository without pushing: `{ "name": "<name>", "private": false, "auto_init": false }`. The MCP spelling is `autoInit`. Add `organization` only for an org owner.
4. Read it back. Require owner/name, `private: false`, and public visibility before recording success.
5. Add `origin` without replacing any remote. Verify owner, name, visibility, URL, and default branch.

`scripts/repository-visibility.mjs` owns the create and readback boundary and fails closed. After a failed or ambiguous create, read back once before any retry. After a failed public readback, do not add `origin`, push, link a Project, enable security, or protect a branch. Push only after the section 6 review passes.

## 3. Applicability and workflows

Build one row per maintained language from manifests, lockfiles, sources, and existing commands. Generated, vendored, archive, snapshot, and fixture files do not count.

```text
language | evidence | format | lint | type | test | coverage | dependency | CodeQL | reason skipped
```

Per applicable category, prefer the project's strict stable native tool, then existing scripts or config that enforce it, then the smallest local config or dependency.

- Pin tools in the manifest and lockfile. Pin every Action to a full commit SHA with the release tag in a comment.
- CI formatters run check-only. CI never writes formatting, generated files, lockfiles, or persisted quality state.
- Every skip needs a concrete language, platform, manifest, or tool-conflict reason; "not configured" is invalid. Type check is inapplicable only without a meaningful static check; CodeQL only when GitHub lacks support.
- One actionlint job covers workflow syntax and embedded shell. Dependency checks use the project's ecosystem and fail on actionable vulnerabilities.
- Give each job a stable unique name and minimal permissions, raised per job: CodeQL gets `security-events: write`, build and test read-only contents. Exclude generated, fixture, archive, dependency, and vendored paths from analysis.
- Run each generated command locally first. If a strict check exposes existing debt, stop; never weaken it.

Every repository with maintained source gets a `quality-guard` job. It runs on `pull_request` only, uses `fetch-depth: 0`, checks out dod-guard at a pinned commit beside the project, and runs:

```text
node <dod-guard-checkout>/packages/quality-guard/skills/quality-refactor/scripts/quality-pr-gate.mjs --base=<base sha> --root=<source root>
```

Options: `--report=<file>`, `--comment=<file>`, `--report-link=<run url>`, `--block-on`, `--rule-block-on=<rule>:<severity>`. The gate fails when the PR adds a medium or high finding, or removes fewer than one medium or high (or three low) of the findings already in the changed files. Upload the report as an artifact. Post the `--comment` file with `quality-pr-gate-comment.mjs --repo=<owner/name> --pr=<number> --body=<file>` to keep one comment per PR; that job needs `pull-requests: write`. Never copy the scanner or register a quality-guard PostToolUse hook. Existing findings do not stop setup. Put the job on the default branch before section 9.

## 4. Ignore rules and instructions

- Merge missing `.gitignore` entries for build outputs, caches, editor state, local credentials, and OS files. Keep existing patterns and comments. Once Git exists, run `git check-ignore -v` on representative paths to confirm no pattern hides intended source, manifests, lockfiles, tests, fixtures, workflows, or instruction files.
- Merge one concise section into the canonical instruction file without replacing guidance. It states the flow: ideas enter via `dod-guard:add-backlog-idea` as Backlog issues; `dod-guard:refine-backlog-item` makes a Todo PBI and writes step plans; `dod-guard:next-ticket` implements and pushes one issue branch; `dod-guard:submit-draft-pr` creates the draft PR; `dod-guard:review-pr` reviews, read-only until explicit acceptance; `dod-guard:complete-pr` alone owns ready, merge, issue confirmation, and branch deletion.
- Keep shared workflow text in the canonical file. Use an import convention only if the repository already does.

## 5. Project and labels

```text
node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>
```

Branch on the outcome (`projects` lists owner, number, title):

- `several` (exit 1): stop and list them.
- `resolved` (exit 0): preserve it and merge status options.
- `none` (exit 1): create a Project under the repository owner, run `gh project link`, rerun as a readback. It must report `resolved`.
- Exit 2: stop with the message.

Read fields through the typed connector or REST ProjectsV2. The final Project has exactly one `Status` field with exactly one case-insensitive option each for `Backlog`, `Todo`, `In Progress`, `Done`. In a new empty Project, replace the unused default Status field if needed. In an existing one, never delete a populated field; use the supported update to keep every option id, name, color, and description. Stop if duplicate statuses cannot merge without changing item meaning. Re-query through the repository link; finding it by owner and title is not proof.

Labels: read live labels (name, description, color) and `scripts/workflow-labels.json`. Through the labels REST endpoint, create missing catalog labels and normalize the description and color of existing ones. Never delete, rename, or alter non-catalog labels. Re-read all; catalog labels must match exactly.

## 6. Credential and staged review

- Rerun the full inspector after local edits. Any `credentialFindings` entry blocks staging until you review its file and signal. Never print matched values. Run a repo-local secret scanner if configured.
- Before the first push, check every tracked and untracked file for keys, tokens, `.env` files, connection strings, and high-entropy values. Fixtures use clearly fake values.
- Review the full diff. Stage explicit reviewed paths only: never `git add .`, `-A`, a glob, or the root. Stage project files in a no-commit repository and setup files otherwise, never generated output, env files, credentials, archives, or unrelated edits.

## 7. Commit, push, checks

Make one initial commit if none exists; otherwise commit only reviewed setup changes, using the repository's commit workflow if any. Push without force and set `origin/<default>` as upstream. Verify origin, branch, upstream, remote default branch, last commit, and worktree, which must be clean.

Wait for every workflow on the pushed commit, querying workflow runs and check runs. A queued, skipped, cancelled, neutral, stale, or missing required job is not success. On failure report the exact job and stop before protection. Take required check names from this commit's successful check runs, matched to the generated job names.

## 8. Security

Use the current REST API. Enable dependency graph, Dependabot alerts and security updates, secret scanning, push protection, and CodeQL (committed workflow or compatible config), and confirm each by readback. If plan, visibility, owner, or API limits block a setting, record the exact response and stop.

## 9. Protection

1. Write a temporary snapshot outside the project, with only `projects` and `checks`:

   ```json
   {"projects":[{"closed":false,"statusOptions":["Backlog","Todo","In Progress","Done"]}],"checks":[{"name":"observed job name","conclusion":"SUCCESS"}]}
   ```

2. Run `node <skill-dir>/scripts/inspect-repository.mjs --github-snapshot <snapshot.json>`. Proceed only if `readyForProtection` is true. A malformed or incomplete snapshot is a blocker with no payload.
3. Apply `protectionPayload` unedited to the default branch through the branch protection REST endpoint.
4. Query again and confirm: PRs required; strict required checks including every observed generated check; admins included; `required_approving_review_count` explicitly `0` for a solo owner; force pushes and deletion disabled.

The PR-only `quality-guard` job is absent from the default-branch snapshot, so require it by name after a PR has run it green. Zero approvals does not bypass independent review or the exact-current-head check gate. Delete only the temporary snapshot, never the repository or Project.

## 10. Report

Report the path, URL, visibility (public if new, preserved if existing), default branch, pushed commit, Project and status options, labels, applicability table with skip reasons, passing checks, security and protection settings (including zero approvals), and clean worktree evidence. State that independent review and exact-current-head checks still gate delivery. On partial failure, lead with the failed operation. Never report complete with proof missing.
