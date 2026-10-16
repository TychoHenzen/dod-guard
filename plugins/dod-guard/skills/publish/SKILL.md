---
name: publish
description: Release changed dod-guard marketplace plugins through a functional or maintenance-only path with required validation and cache refresh.
---

# Publish dod-guard marketplace changes

Start only on an explicit user request to publish or release a finished change in this monorepo; never infer one.

Before anything else, read `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root. Where this skill sets a stricter boundary, the stricter boundary wins. For shell composition, see the [command-composition contract](../../docs/command-composition.md): pass native arguments separately, and halt before any mutation if an argument or parent is missing.

## Release model

Two routes reach the Claude Code and Codex marketplace:

- `functional`: a reviewed pull request merged to `master`.
- `maintenance-only`: a version-bumped commit pushed straight to `master` after validation.

Either route finishes with green CI and a marketplace refresh in each client. Nothing publishes to npm.

Clients key their cache on version, so unchanged versions can leave old content in place. Every changed shipped code plugin needs one valid, matching version in each of its manifests, or clients keep the old content. Four files carry a version: `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and any present adapter package. The root `.claude-plugin/marketplace.json` is the only marketplace manifest. A paired version-only bump made solely to invalidate the cache for maintenance content remains `maintenance-only`; any other manifest change is `functional`.

## Installation identity preflight

This preflight comes before every other release step. Find the helper through the loaded skill only. Do not look in the checkout or in a guessed cache, do not scan caches or choose the newest path, and do not fall back to another marketplace, client install, or checkout.

Failure handling comes first. If the helper exits non-zero, report the requested values, the observed values, the exact mismatch, and a safe next step, then stop. Do not run the procedure or any Git, GitHub, protection, version-bump, or client-cache mutation. If it succeeds, bind the run to the returned version and `skillPath`, and use the returned `pluginRoot` for every later `<plugin-root>` path.

Locate the helper this way:

1. Take the absolute path to `skills/publish/SKILL.md` for the loaded skill. Its directory is `<skill-dir>`; in Claude Code that is `${CLAUDE_PLUGIN_ROOT}/skills/publish`. Confirm `<skill-dir>/scripts/preflight-installation.mjs` exists before running it.
2. Treat any version or path the caller gave as an exact pin and forward it with `--version <version>` or `--skill-path <path>`. A caller's path pin is the absolute path to `skills/publish/SKILL.md`, not the plugin root. Forward nothing the caller did not give.
3. Run the inventory command, keeping its stdout and exit status before passing captured JSON to Node. Stderr never goes into that JSON.

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

The helper accepts a non-zero inventory status only if stdout still parses and shows exactly one installed, enabled registration with the expected identity. It rejects unparseable stdout, empty stdout, and any missing, duplicate, disabled, or wrong-identity record, and its message names the status.

What each client must show:

- Codex: a unique enabled `dod-guard@dod-guard-monorepo` record, from marketplace `dod-guard-monorepo` with the expected Git source. Its manifest identity and version must match the registration. The `source.path` is registration evidence and can differ from the loaded cache root.
- Claude Code: a unique enabled `dod-guard@dod-guard` record whose `installPath` resolves to the loaded install, with matching manifest identity and version.
- Both: the manifest is `.codex-plugin/plugin.json` or `.claude-plugin/plugin.json` respectively, and the loaded publish skill is a readable file inside its loaded plugin root.

This loaded-root check is the pre-release installation identity preflight. Before release it uses the loaded helper's root; after release the loaded skill still holds the previous release, so the check must use the registered root. Step 11 passes `--registered-root` to the same helper (Claude `installPath`, Codex `source.path`).

## Windows authentication boundary

On Windows the entire flow runs in the authenticated interactive PowerShell session that launched it. Check authentication before anything else:

```powershell
gh auth status
$githubAuthStatus = $LASTEXITCODE
if ($githubAuthStatus -ne 0) { throw "GitHub CLI authentication failed; stop before release mutations" }
```

If this fails, nothing may happen: no protection change, no checkout or ref move, no commit, no push, no client refresh, no cache mutation. Repair authentication in the user's normal session, then rerun both the auth and installation preflights from the start and throw away partial evidence.

- Never copy or persist credentials.
- Do not invoke `gh api` from a Node REPL or any other unauthenticated nested runtime.
- `preflight-installation.mjs` only parses local client inventory.
- `maintenance-publish.ps1` performs every release mutation; `release-verification.ps1` only reads, after the release. Both run each native command through `publish-native-command.ps1` and judge it by exit code alone, treating stderr as evidence and never as proof of success.

## Source metadata preflight

This runs after the installation and auth preflights and ahead of any release, protection, checkout or ref, commit, push, or cache mutation.

```text
node scripts/ci/validate-plugins.mjs
```

It examines package, Claude, Codex, and present adapter version metadata. Each entry needs a valid `x.y.z` version and all must agree. Stop on a mismatch, missing or malformed version, or ambiguous source, and list each affected path and observed value. Correct the tracked metadata explicitly and rerun. The skill never synchronizes or rewrites manifests, picks an authority, or leans on a later validator or cache readback.

## Procedure

1. Inspect the starting state with `git status --short --branch --untracked-files=all`; read repository metadata from GitHub MCP, with `gh repo view` as the fallback. Classify every staged, unstaged, tracked, and untracked path before branch or ref movement. If any path is credential-like, destructive, unrelated, or indistinguishable, report the exact paths and stop before changing the checkout or refs. Never silently filter a mixed tree, stash, reset, overwrite, move, or include unrelated user-owned changes.
2. Before committing anything, scan the complete pending tree with `node <plugin-root>/skills/setup-repository/scripts/inspect-repository.mjs <repository-root>`. Stop when `credentialFindings` is non-empty. Never print matched values.
3. Classify the complete pending tree before requiring a PBI or pull request. Treat a file as `functional` when it alters runtime code, installed behavior, MCP or hook wiring, or manifest content beyond the paired version-only bump. Only docs, skill or agent prose, tests, CI config, generated reports, and their equivalents are `maintenance-only`. Read the contents when the category is unclear. If any file is functional, use the functional path for the whole release.
4. Take the passing metadata preflight as the version decision. Check that each changed plugin's description still fits its shipped skills and agents, and update the root marketplace description when it states a skill count that changed.
5. Run these gates from the repository root before the release commit:

   ```text
   npm run build
   npm test
   npm run bundle
   node scripts/ci/validate-plugins.mjs
   npx @biomejs/biome check packages/code-explorer/src/ packages/fossil/src/ packages/knowledge-base/src/ packages/quality-guard/src/ plugins/dod-guard/ scripts/ci/ --no-errors-on-unmatched
   ```

   Windows PowerShell gets the package source directories spelled out; no glob.
6. When a gate writes tracked changes, go back: reclassify the whole tree, rerun the inspector, and rerun the affected gates before the release commit.
7. For a `maintenance-only` release:
   - Do not require or create a PBI, feature branch, or pull request. Work only in the primary checkout.
   - Confirm the checkout is primary by resolving `git rev-parse --path-format=absolute --git-dir` and `git rev-parse --path-format=absolute --git-common-dir` and comparing the results with host path semantics. If either value is unavailable or the paths differ, stop before any branch/ref, release, protection, or cache mutation.
   - Record the starting branch (if attached) and `HEAD`. Fetch `origin master` and save its exact SHA as `<saved-sha>`.
   - Use `git switch --detach <saved-sha>` in this same checkout. Continue only if Git retains every classified release path without conflict; if it refuses the switch, verify and report the unchanged starting state, then stop. Never create another checkout, stash, or reset to carry release paths.
   - After the switch, verify `HEAD` equals the saved SHA and confirm the starting branch reference is unchanged, then rerun the repository inspector and release gates against this exact base.
   - Stage only the classified release paths; never use blanket staging. Require the release commit's parent to equal the saved SHA and `allow_force_pushes.enabled` to be true. A force-push allowance alone does not bypass the PR or check rules,. Other users remain subject to the branch rules.
   - Read the protection snapshot once, after validation and immediately before any DELETE (or before the push when admin enforcement is already disabled). Read `gh api --method GET repos/{owner}/{repo}/branches/master/protection` and, as a separate call, `repos/{owner}/{repo}/branches/master/protection/enforce_admins`. Require both initial reads to return HTTP `200` with non-empty objects before any protection mutation. The broad body needs a boolean `enforce_admins.enabled`, the admin body a boolean `enabled`, and the two must agree. Keep the parsed protection object as the immutable restore snapshot, and compare JSON semantically by object keys and array values.
   - Do all mutation through the checked-in helper. Use the checked-in `<skill-dir>/scripts/maintenance-publish.ps1` helper by dot-sourcing it and calling `Invoke-MaintenancePublish` with the owner, repository, saved SHA, a `-CommitAction` script block that stages only the classified release paths and commits them, and a `-PrePushAction` script block that reruns the release gates. It checks exact values and rejects a non-primary checkout, a head or parent mismatch, an invalid endpoint or method, unavailable `allow_force_pushes.enabled`, and every unpinned force-push alternative. It builds these values:
     - `protection_endpoint= repos/{owner}/{repo}/branches/master/protection`
     - `admin_endpoint= repos/{owner}/{repo}/branches/master/protection/enforce_admins`
     - `admin_method= DELETE`
     - `--force-with-lease=refs/heads/master:<saved-sha> origin HEAD:refs/heads/master`
   - Order inside the helper: commit action, pre-push validation, tree check, and only then the protection change. The validation runs, and the tree is checked, before admin enforcement is disabled. The tree check requires `HEAD` to equal the release commit, the release commit's parent to equal the saved SHA, and `git status --porcelain --untracked-files=no` to be empty. The agent must not run any Git worktree command. It never invokes a Git worktree command.
   - Early failures leave protection alone. Any failure before the DELETE, including preflight failures (a non-primary checkout, or `HEAD` not equal to the saved SHA) and commit, validation, tree-check, and protection-snapshot failures (an invalid initial readback, or `allow_force_pushes.enabled` not true), stops with protection unchanged, issues no DELETE or POST, and reports `DeleteAttempted` false. For those failures a `Restored` value of false with `DeleteAttempted` false is therefore not a protection incident.
   - Disable step. If the saved `enforce_admins.enabled` is true, the helper invokes only the validated admin endpoint with `gh api --method DELETE <admin_endpoint> --include`. It marks restoration required before invoking DELETE. The call requires HTTP `204`, and the helper does not parse the deliberately empty body as JSON. Whatever the outcome, it reads the admin endpoint and complete protection object back even when the command errors or returns an unexpected status; HTTP `200`, `enabled=false`, and unchanged non-admin fields prove the disable. This read-only `Disable` readback runs first. HTTP `200`, `enabled=false`, and equality of every non-admin protection field are required before release proceeds; an invalid response or readback stops before the push.
   - Push step. From DELETE to the restoring POST, the helper issues only that disable readback, the leased push, and one `git ls-remote origin refs/heads/master` readback. The push is `git push --force-with-lease=refs/heads/master:<saved-sha> origin HEAD:refs/heads/master`; the lease rejects any intervening update, and the off-window is the push plus its readback. The readback must equal the release commit, and a mismatch counts as a failure that still triggers cleanup. Never use an unpinned force push.
   - If master advances, restore protection, stop, never pull, merge, or retry, and preserve the exact release checkpoint. A later run reclassifies and rebuilds from the new head. A pull request is never the fallback.
   - Cleanup. The helper owns the cleanup `finally` scope, and in that scope every exit after an attempted DELETE, including a failed disable readback, a failed push, or a remote readback mismatch, restores the saved admin state. The restoring call is `gh api --method POST <admin_endpoint> --include`, and it requires HTTP `200`. It uses only that same validated endpoint. Admin enforcement is off from the DELETE until the restoring POST.
   - The helper reads the admin endpoint and complete protection object back after every POST attempt. If any response, admin state, or protection field differs from the saved snapshot, it retries that exact POST once and reads both resources again. If either read throws, it stops without a second POST. It never retries an unknown mutation before its complete readback. If the second readback still differs, it stops and reports the exact remaining difference.
   - If admin enforcement was initially disabled, it does not call POST: it proves it remains disabled and the complete protection snapshot is unchanged, and this run then reports `Restored` true with `RestoreAttempts` 0 and `DeleteAttempted` false.
   - One risk stays accepted: a hard kill between the DELETE and the cleanup cannot restore protection, and the exposure is limited to the push and its readback.
8. For a `functional` release, invoke `dod-guard:submit-draft-pr` with the parent PBI number after the release commit is pushed to the issue branch. The pull request itself is not created or updated here, and this skill never approves, readies, merges, or closes it.
9. Look at CI on the exact published commit. `build-test`, `plugin-config`, `static-analysis`, and `package-integrity` must all pass.
10. After a direct maintenance push or a merged functional release has green CI, refresh each client with exactly these commands:

    ```text
    Claude Code: /plugin marketplace update dod-guard, then /reload-plugins
    Codex: codex plugin marketplace upgrade dod-guard-monorepo
    Codex: codex plugin add dod-guard@dod-guard-monorepo
    ```

    Then confirm `codex plugin list` reports the released version. Never copy files into either client cache by hand. Once both refreshes have succeeded, a machine that runs the shared host must restart only its two named apps, and only after the cache refresh succeeds, leaving every other PM2 process alone:

    ```text
    pm2 restart dod-guard-quality-guard dod-guard-knowledge-base --update-env
    ```
11. On Windows PowerShell, once the refreshes and any host restart are done, run the read-only verification for the published SHA, expected parent SHA, and released version:

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

    The helper records every command exit status before parsing its output. It compares current and remote heads, reads the full protection and `enforce_admins` state, confirms every required check on the exact SHA, and examines both client registrations, rechecking registration, identity, manifest, and the publish skill under the registered root. It verifies the registered installation of the new release rather than the loaded one, so no session reload is needed. It still fails when the registered version differs from `-ExpectedVersion`, and any missing, malformed, stale, or mismatched evidence fails closed. It never publishes, changes protection, touches a checkout, or copies client files.

## Boundaries

- No npm releases or tags.
- A functional release always goes through pull-request review.
- A force-push allowance does not bypass branch protection by itself; the maintenance route depends on the temporary admin bypass together with the exact `--force-with-lease` guard.
- A release is not complete until the published commit has green CI.
