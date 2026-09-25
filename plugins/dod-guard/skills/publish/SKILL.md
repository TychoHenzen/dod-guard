---
name: publish
description: Release changed dod-guard marketplace plugins through a functional or maintenance-only path with required validation and cache refresh.
---

# Publish dod-guard marketplace changes

Use this skill only when the user explicitly asks to publish or release a
completed change in this monorepo.

## Shared working defaults

Read and apply `standards/working-defaults.md` from the plugin root. Local
safety or authority boundaries below remain stricter.

Before GitHub calls, read `<plugin-root>/standards/github-request-discipline.md`.

## Release model

This repository is a Claude Code and Codex plugin marketplace. Nothing
publishes to npm. Functional releases use a reviewed pull request merged into
`master`. A `maintenance-only` release skips the PBI and PR ceremony: push its
version-bumped commit directly to `master`, then wait for green CI and refresh
each client's marketplace.

The root `.claude-plugin/marketplace.json` is the only marketplace manifest.
Every changed shipped plugin needs matching version bumps in
`.claude-plugin/plugin.json` and, when present, `.codex-plugin/plugin.json`.
Those versions are cache keys, so a client can retain old plugin content without
the bump. A paired version-only bump made solely to invalidate the cache for
maintenance content remains `maintenance-only`; any other manifest change is
`functional`.

## Installation identity preflight

Before any other release step, resolve `<skill-dir>` from this loaded skill:
`${CLAUDE_PLUGIN_ROOT}/skills/publish` in Claude Code, or the directory
containing this loaded `SKILL.md` in Codex. Confirm
`<skill-dir>/scripts/preflight-installation.mjs` exists. Never locate the helper
from the repository checkout or from a guessed cache directory.

Treat any caller-supplied version or path as an exact pin. A path pin is the
absolute path to `skills/publish/SKILL.md`, not the plugin root. Pass only pins
that the caller supplied; omit the corresponding flag otherwise:

Run the client inventory command first and check its exit status before passing
captured JSON to Node. A direct pipeline can hide a failed inventory command.
Use the snippet for the active shell, set the client to codex or claude, and
append only exact pins supplied by the caller to the helper command:

PowerShell:

```powershell
$client = 'codex' # use 'claude' in Claude Code
$inventory = & $client plugin list --json
$clientStatus = $LASTEXITCODE
if ($clientStatus -ne 0) { throw "$client plugin list failed with exit code $clientStatus" }
$inventory | node "<skill-dir>/scripts/preflight-installation.mjs" $client
if ($LASTEXITCODE -ne 0) { throw "Installation preflight failed; stop before release mutations" }
```

POSIX shell:

```sh
client=codex # use claude in Claude Code
inventory=$("$client" plugin list --json)
client_status=$?
if [ "$client_status" -ne 0 ]; then
  printf '%s plugin list failed with exit code %s\n' "$client" "$client_status" >&2
  exit "$client_status"
fi
printf '%s\n' "$inventory" | node "<skill-dir>/scripts/preflight-installation.mjs" "$client"
preflight_status=$?
if [ "$preflight_status" -ne 0 ]; then
  exit "$preflight_status"
fi
```

The helper accepts the inventory on stdin and returns JSON. For Codex, it
requires the unique enabled `dod-guard@dod-guard-monorepo` record, its exact
`dod-guard-monorepo` marketplace name and Git source, `source.path`, and the
`.codex-plugin/plugin.json` identity/version. For Claude Code, it requires the
unique enabled `dod-guard@dod-guard` record, `installPath`, and the
`.claude-plugin/plugin.json` identity/version. Codex uses the loaded helper's
plugin root for its manifest and `skills/publish/SKILL.md` checks; its
`source.path` is marketplace registration evidence and may differ from that
loaded cache root. Claude Code's `installPath` must resolve to the loaded
installation, and every loaded publish skill must be a readable file inside
its loaded plugin root.

If the helper exits non-zero, report its requested and observed values, exact
mismatch, and safe next step, then stop. Do not run the procedure or any Git,
GitHub, protection, version-bump, or client-cache mutation. On success, use the
returned `pluginRoot` for every later `<plugin-root>` path and bind this run to
the returned version and `skillPath`. Never scan caches, choose a newest path,
or fall back to another marketplace, client installation, or checkout.

## Procedure

1. Inspect `git status --short --branch --untracked-files=all`, the current
   branch, and the GitHub MCP repository metadata operation. If MCP is
   unavailable, use `gh repo view`. Classify every staged, unstaged, tracked,
   and untracked path before branch or ref movement. Continue only when each
   pending path is clearly part of the authorized release. If any path is
   credential-like, destructive, unrelated, or indistinguishable, report the
   exact paths and stop before changing the checkout or refs. Never silently
   filter a mixed tree, stash, reset, overwrite, move, or include unrelated
   user-owned changes.
2. Before `/commit`, run the existing repository inspector against the complete
   pending tree:
   `node <plugin-root>/skills/setup-repository/scripts/inspect-repository.mjs <repository-root>`.
   Stop when `credentialFindings` is non-empty. Never print matched values.
3. Classify the complete pending tree before requiring a PBI or pull request.
   Treat changes as `functional` when they alter runtime code, installed
   behavior, MCP or hook wiring, or plugin manifest content beyond the paired
   version-only cache-key bump described above. Treat changes as
   `maintenance-only` only when they are limited to documentation, skill or
   agent prose, tests, CI configuration, generated reports, or equivalent
   non-product maintenance. A cache-key-only bump stays maintenance-only only
   when all other changes are maintenance-only. Inspect file
   contents when a path classification is unclear. If any file is functional,
   use the functional path for the whole release.
4. Confirm each changed plugin's Claude Code and Codex manifest versions and
   descriptions match its shipped skills or agents. Update the root marketplace
   description if it states a changed skill count.
5. Run the release gates from the repository root before committing:
   On Windows PowerShell, list package source directories explicitly.

   ```text
   npm run build
   npm test
   npm run bundle
   node scripts/ci/validate-plugins.mjs
   npx @biomejs/biome check packages/code-explorer/src/ packages/fossil/src/ packages/quality-guard/src/ scripts/ci/ --no-errors-on-unmatched
   ```

6. If a gate generates tracked changes, reclassify the complete tree, rerun the
   inspector, and rerun the affected gates before committing.
7. For a `maintenance-only` release:
   - Do not require or create a PBI, feature branch, or pull request.
   - Use only the current primary checkout. Do not run any Git worktree
     command. Confirm the checkout is primary by resolving
     `git rev-parse --path-format=absolute --git-dir` and
     `git rev-parse --path-format=absolute --git-common-dir` and comparing the
     resulting paths with host path semantics. If either value is unavailable
     or the paths differ, stop before any branch/ref, release, protection, or
     cache mutation.
   - After the pending paths are classified and the release is confirmed
     `maintenance-only`, record the starting branch (if attached) and `HEAD`,
     fetch `origin master`, and save the exact `origin/master` SHA. Use
     `git switch --detach <saved-sha>` in this same checkout. Continue only if
     Git retains every classified release path without conflict; if it refuses
     the switch, verify and report the unchanged starting state, then stop.
     Never create another checkout, stash, or reset to carry release paths.
     Verify `HEAD` equals the saved SHA and the starting branch reference is
     unchanged, then rerun the repository inspector and release gates against
     this exact base.
   - Require the release commit's parent to equal the saved SHA and
     `allow_force_pushes.enabled` to be true. Stage only the classified release
     paths; never use blanket staging. Push only with
     `git push --force-with-lease=refs/heads/master:<saved-sha> origin HEAD:refs/heads/master`.
     This remains a fast-forward, and the lease rejects any intervening update.
     If master advances, restore protection, stop `/commit`'s pull-and-merge
     retry, preserve the exact release checkpoint, and stop. A later run must
     classify the pending release paths again and rebuild from the newly saved
     head before rerunning all gates. Never use an unpinned force push or create
     a PR as fallback.
   - Read and save the complete protection with
     `gh api --method GET repos/{owner}/{repo}/branches/master/protection` and
     read the admin state separately from
     `repos/{owner}/{repo}/branches/master/protection/enforce_admins`. Treat the
     parsed protection object as the immutable restore snapshot; compare JSON
     semantically by object keys and array values, not by formatting or a
     hand-picked subset of fields. Require both initial reads to return HTTP
     `200` with non-empty objects, require the broad response to contain an
     `enforce_admins.enabled` boolean and the admin response to contain an
     `enabled` boolean, and require those values to agree before any mutation.
   - Before any protection mutation, construct and validate these exact values:
     `protection_endpoint= repos/{owner}/{repo}/branches/master/protection`,
     `admin_endpoint= repos/{owner}/{repo}/branches/master/protection/enforce_admins`,
     and `admin_method= DELETE`. Require the admin endpoint to equal the literal
     `/branches/master/protection/enforce_admins` path and the method to equal
     `DELETE`; stop before the request if either check fails. The broad
     `/branches/master/protection` endpoint is read-only in this flow: never
     send `DELETE`, `POST`, or `PUT` to it.
   - A force-push allowance alone does not bypass the PR or check rules. If the
     saved `enforce_admins.enabled` is true, invoke only the validated admin
     endpoint with `gh api --method DELETE <admin_endpoint> --include --silent`.
     Enter the cleanup scope and mark restoration required before invoking this
     DELETE. Capture the exit code and response headers; require HTTP `204`, and
     do not parse the deliberately empty body as JSON. Read the admin endpoint
     back even when the command errors or returns an unexpected status. Require
     HTTP `200`, a valid response object, and `enabled=false`; require the full
     protection readback to contain a valid `enforce_admins` object and every
     other field to equal the saved snapshot before the release can proceed. An
     invalid path, method, status, body, or readback stops before the push and
     reports the exact evidence; every exit after an attempted DELETE, including
     a failed pre-push readback, runs the cleanup scope below.
   - Use `/commit`'s staging and commit-message steps only. Do not run its
     ordinary push, sync, or pull-and-merge retry. Push only with the saved-SHA
      `--force-with-lease` command above. In a `finally` step for that cleanup
      scope, restore the saved admin state even if commit, push, or pre-push
      validation fails: if it was initially enabled, invoke only the same
      validated endpoint with `gh api --method POST <admin_endpoint> --include
      --silent`, require HTTP `200`, and do not use its suppressed body as a
      success predicate. Read the admin endpoint and complete protection object
      back after every POST attempt. If any response, admin state, or complete
      protection field differs from the saved snapshot, retry that exact `POST`
      once and read both resources again. Do not retry an unknown mutation before
     its readback. If the second readback still differs, stop and report the
     exact remaining difference; never claim release completion. If admin
     enforcement was initially disabled, do not call `POST`; prove it remains
     disabled and the complete protection snapshot is unchanged. Other users
     remain subject to the branch rules throughout.
8. For a `functional` release, invoke `/submit-draft-pr` with the parent PBI
   number after `/commit` has pushed the issue branch. Do not create or update
   the pull request yourself. Never approve, mark ready, merge, or close it.
9. After a direct maintenance push or a human-merged functional release, inspect
   CI on the exact published commit. It must pass
   `build-test`, `plugin-config`, `static-analysis`, and `package-integrity`.
10. After a direct maintenance push or a merged functional release has green CI,
   refresh both clients:

   ```text
   Claude Code: /plugin marketplace update dod-guard, then /reload-plugins
   Codex: codex plugin marketplace upgrade dod-guard-monorepo
   Codex: codex plugin add dod-guard@dod-guard-monorepo
   ```

   Confirm `codex plugin list` reports the released version. Do not copy files
   into either client cache manually.

## Boundaries

- Do not create npm releases or tags.
- Functional releases still require pull-request review.
- A force-push allowance does not bypass branch protection by itself. The
  maintenance-only path relies on a temporary admin bypass and an exact
  `--force-with-lease` guard.
- Do not call a release complete until the published commit has green CI.
