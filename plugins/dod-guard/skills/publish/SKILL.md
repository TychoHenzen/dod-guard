---
name: publish
description: Release changed dod-guard marketplace plugins through a functional or maintenance-only path with required validation and cache refresh.
---

# Publish

Run only when the user explicitly asks to publish or release a completed change in this monorepo.

Read `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root. Where this skill is stricter, this skill wins. Every command also follows the [command-composition contract](../../docs/command-composition.md): separate native arguments, capture producer status before limiting output, and stop before mutation when an argument or parent is missing.

## Release model

- Nothing publishes to npm. Never create npm releases or tags.
- A `functional` release goes through a reviewed pull request merged to `master`.
- A `maintenance-only` release skips the PBI, branch, and PR. It pushes its version-bumped commit straight to `master`, waits for green CI, then refreshes each client's marketplace.
- The root `.claude-plugin/marketplace.json` is the only marketplace manifest.
- Each changed shipped code plugin needs one valid matching version in `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and any present adapter package. Versions are cache keys: without a bump a client may keep old content.
- A paired version-only bump made just to invalidate cache stays maintenance-only. Any other manifest change is functional.
- The run may not change repository security settings, `enforce_admins` included, when the brief does not authorize it, repository instructions forbid it, or the permission system denies the `DELETE`. In that case never start the maintenance path, and never call `Invoke-MaintenancePublish` (maintenance step 5). Deliver the release through a release PBI and a version-bump pull request instead: refine the PBI, then `dod-guard:next-ticket`, `dod-guard:submit-draft-pr`, `dod-guard:review-pr`, `dod-guard:fix-pr-review`, and `dod-guard:complete-pr`, then steps 9 to 11 below. The release keeps its classification; only the delivery route changes. On this route only the user runs the `DELETE` and `POST` on `branches/master/protection/enforce_admins` (through `maintenance-publish.ps1`) and the Claude `/plugin` commands in step 10. The agent never changes protection on its own.

## Preflights

Run these first, in order. Stop at the first failure, before any mutation.

### 1. Installation identity

Resolve `<skill-dir>` from the loaded skill (Claude: `${CLAUDE_PLUGIN_ROOT}/skills/publish`; Codex: the directory of the loaded SKILL.md) and confirm `preflight-installation.mjs` exists there. Never find the helper from the repo checkout or a guessed cache directory.

A caller-supplied version or path is an exact pin. A path pin is the absolute path to `skills/publish/SKILL.md`, not the plugin root. Pass only supplied pins, as `--version <v>` and `--skill-path <path>`.

Capture inventory stdout and exit status before passing JSON to Node, because a direct pipe hides the client's failure. Keep stderr out of the JSON. Pass the status with `--inventory-status <n>`. A non-zero status passes only when stdout still parses and holds exactly one installed, enabled registration with the expected identity.

```powershell
$client = 'codex' # use 'claude' in Claude Code
$inventory = & $client plugin list --json
$clientStatus = $LASTEXITCODE
$inventory | node "<skill-dir>/scripts/preflight-installation.mjs" $client --inventory-status $clientStatus
if ($LASTEXITCODE -ne 0) { throw "Installation preflight failed; stop before release mutations" }
```

```sh
client=codex # use claude in Claude Code
inventory=$("$client" plugin list --json)
client_status=$?
printf '%s\n' "$inventory" | node "<skill-dir>/scripts/preflight-installation.mjs" "$client" --inventory-status "$client_status"
preflight_status=$?
if [ "$preflight_status" -ne 0 ]; then
  exit "$preflight_status"
fi
```

The helper expects a unique enabled registration: Codex `dod-guard@dod-guard-monorepo` (marketplace `dod-guard-monorepo`, matching `source.path` and manifest), or Claude `dod-guard@dod-guard` (`installPath` resolving to the loaded installation). For Codex, `source.path` is registration evidence only and may differ from the loaded cache root.

On a non-zero exit, report requested against observed values, the mismatch, and a safe next step, then stop. On success, use the returned `pluginRoot` for every `<plugin-root>` path and bind the run to the returned version and `skillPath`. Never scan caches, pick the newest path, or fall back to another installation or checkout.

Step 11 reruns the helper with `--registered-root`, which reads the plugin root from the active registration (Claude `installPath`, Codex `source.path`) because the loaded skill still holds the previous release.

### 2. GitHub authentication (Windows)

Run the whole flow from the authenticated interactive PowerShell session that launched it, and prove auth before any GitHub API step.

```powershell
gh auth status
$githubAuthStatus = $LASTEXITCODE
if ($githubAuthStatus -ne 0) {
  throw "GitHub CLI authentication failed; stop before release mutations"
}
```

- Never call `gh api` from a Node REPL or other unauthenticated nested runtime. The installation helper only parses local inventory and is not an auth bridge.
- Never copy or persist credentials to another runtime or file.
- On failure, restore auth in the user's normal PowerShell and rerun both preflights from the start.

`maintenance-publish.ps1` makes the mutating `gh` calls and `release-verification.ps1` the read-only ones. Both go through `publish-native-command.ps1` and judge by exit code only. Stderr is evidence, never a success signal.

### 3. Source metadata

```text
node scripts/ci/validate-plugins.mjs
```

Run it from the repo root. It checks that package, Claude, Codex, and adapter versions are valid x.y.z and agree. On any bad version, report each path and value, stop, fix the tracked metadata explicitly, and rerun. It never syncs manifests or picks an authority.

## Procedure

1. Run `git status --short --branch --untracked-files=all` and read repo metadata (GitHub MCP, else `gh repo view`). Classify every staged, unstaged, tracked, and untracked path before any branch or ref movement. Continue only if each path clearly belongs to the authorized release. If any path is credential-like, destructive, unrelated, or indistinguishable, report the exact paths and stop. Never silently filter a mixed tree, stash, reset, overwrite, move, or include unrelated user-owned changes; never create another checkout or run a Git worktree command to carry release paths.
2. Run the inspector on the whole pending tree before committing. Stop if `credentialFindings` is non-empty, and never print matched values.
   ```text
   node <plugin-root>/skills/setup-repository/scripts/inspect-repository.mjs <repository-root>
   ```
3. Classify the whole tree, inspecting file contents when a path is unclear. Functional means runtime code, installed behavior, MCP or hook wiring, or manifest content beyond the paired version-only bump. Maintenance-only means docs, skill or agent prose, tests, CI config, generated reports, or similar work. One functional file makes the whole release functional.
4. The passing metadata preflight is the version decision. Confirm changed plugins' descriptions still match their shipped skills and agents, and update the root marketplace description if it states a changed skill count.
5. Run the gates from the repo root before committing. On Windows PowerShell, list package source dirs explicitly.
   ```text
   npm run build
   npm test
   npm run bundle
   node scripts/ci/validate-plugins.mjs
   npx @biomejs/biome check packages/code-explorer/src/ packages/fossil/src/ packages/knowledge-base/src/ packages/quality-guard/src/ plugins/dod-guard/ scripts/ci/ --no-errors-on-unmatched
   ```
6. If a gate generates tracked changes, reclassify, rerun the inspector, and rerun the affected gates before committing.
7. Maintenance-only: follow the next section. Functional: go to step 8.
8. Functional: once the release commit is on the issue branch, invoke `dod-guard:submit-draft-pr` with the parent PBI number. Do not create or update the PR yourself, and never approve, mark ready, merge, or close it.
9. After a direct maintenance push or a human-merged functional release, inspect CI on the exact published commit. All four checks must pass: `build-test`, `plugin-config`, `static-analysis`, `package-integrity`. Until then the release is not complete.
10. After green CI, refresh both clients and confirm `codex plugin list` shows the released version. Never copy files into a client cache by hand.
    ```text
    Claude Code: /plugin marketplace update dod-guard, then /reload-plugins
    Codex: codex plugin marketplace upgrade dod-guard-monorepo
    Codex: codex plugin add dod-guard@dod-guard-monorepo
    ```
    If the machine runs the shared MCP host, restart only these two apps, and only after both refreshes succeed. A machine without those apps does nothing, and no other PM2 process restarts.
    ```text
    pm2 restart dod-guard-quality-guard dod-guard-knowledge-base --update-env
    ```
11. On Windows PowerShell, after the refreshes and any restart, run the read-only verification. It checks heads, protection, the four checks on the published SHA, and both client registrations against `ExpectedVersion`, and fails closed on missing, stale, or mismatched evidence.
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

## Maintenance-only path (step 7)

Create no PBI, feature branch, or PR. Stay in the current primary checkout, per `standards/working-defaults.md`, and stage only classified paths.

1. Compare `git rev-parse --path-format=absolute --git-dir` with `git rev-parse --path-format=absolute --git-common-dir`. If either is unavailable or they differ, stop.
2. Record the starting branch and HEAD, fetch `origin` `master`, and save its exact SHA.
3. Run `git switch --detach <saved-sha>`. Continue only if Git keeps every classified path without conflict. If the switch is refused, report the unchanged starting state and stop.
4. Verify HEAD equals the saved SHA and the starting branch ref is unchanged, then rerun the inspector and gates on this base. The release commit's parent must equal the saved SHA, and `allow_force_pushes.enabled` must be true.
5. Dot-source `<skill-dir>/scripts/maintenance-publish.ps1` and call `Invoke-MaintenancePublish` with owner, repo, saved SHA, a `-CommitAction` block (stage classified paths, commit), and a `-PrePushAction` block (rerun the gates). This is the only mutation boundary. Skip it, and the whole maintenance path, when the run may not change protection (see the release model).

The helper snapshots full protection and admin state (`gh api --method GET repos/{owner}/{repo}/branches/master/protection`, plus its `enforce_admins` endpoint), disables only admin enforcement (`DELETE`, expect HTTP 204), pushes, checks `git ls-remote origin refs/heads/master` equals the release commit, and restores the exact saved state (`POST`, expect HTTP 200) with readbacks. It restores on every exit after an attempted DELETE, reports any remaining difference, and never retries an unknown mutation. A force-push allowance alone does not bypass protection: the path relies on temporary admin bypass plus the exact lease.

```text
git push --force-with-lease=refs/heads/master:<saved-sha> origin HEAD:refs/heads/master
```

The lease keeps the push a fast-forward and rejects any intervening update. Never use an unpinned force push or fall back to a PR. Other users stay subject to the branch rules.

Read `Success`, `Stage`, `DeleteAttempted`, `Restored`, and `RestoreAttempts` from the result.

- A failure before the DELETE leaves protection untouched and reports `DeleteAttempted` false. That with `Restored` false is not a protection incident.
- If `master` advances, protection is restored. Stop without pulling, merging, or retrying the push, and keep the checkpoint. A later run reclassifies pending paths, rebuilds from the new head, and reruns all gates.
- A hard kill between DELETE and cleanup cannot restore protection. Exposure is limited to the push.
