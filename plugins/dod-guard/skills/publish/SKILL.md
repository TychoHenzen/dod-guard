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

## Procedure

1. Inspect `git status --short`, the current branch, and the GitHub MCP
   repository metadata operation. If MCP is unavailable, use `gh repo view`. A
   dirty workspace can be the release input. List and classify every pending
   path first. Include every ordinary path only when it is clearly part of the
   authorized release. Preserve and report credential-like files, destructive
   intent, unrelated or indistinguishable work, and stop before `/commit`
   rather than silently filtering it.
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
   - Push from a separate worktree based on the exact latest `origin/master`.
     If needed, create that worktree and carry over only the classified release
     changes. Leave the source worktree untouched and rerun the inspector and
     gates in the release worktree.
   - Save the exact `origin/master` SHA and require the release commit's parent
     to equal it. Require `allow_force_pushes.enabled` to be true. Push only with
     `git push --force-with-lease=refs/heads/master:<saved-sha> origin HEAD:refs/heads/master`.
     This remains a fast-forward, and the lease rejects any intervening update.
     If master advances, restore protection, stop `/commit`'s pull-and-merge
     retry, rebuild from the new head, and rerun all gates. Never use an
     unpinned force push or create a PR as fallback.
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
