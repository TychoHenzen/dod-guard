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
     `gh api repos/{owner}/{repo}/branches/master/protection`. A force-push
     allowance alone does not bypass the PR or check rules. If
     `enforce_admins.enabled` is true, temporarily disable only
     admin enforcement with
     `gh api -X DELETE repos/{owner}/{repo}/branches/master/protection/enforce_admins --silent`.
     The endpoint returns no content, so `--silent` avoids JSON parsing it.
     Read protection back even if the command reports an error. Proceed only
     when `enforce_admins.enabled` is false and every other saved setting is
     unchanged. Other users remain subject to the branch rules.
   - Use `/commit`'s staging and commit-message steps only. Do not run its
     ordinary push, sync, or pull-and-merge retry. Push only with the saved-SHA
     `--force-with-lease` command above. In a `finally` step, restore the full
     saved protection with
     `gh api -X POST repos/{owner}/{repo}/branches/master/protection/enforce_admins --silent`,
     even if commit or push fails. Read protection back even if the command
     reports an error. If it is not fully restored, retry `POST` once and read
     it back again. If any setting still differs, stop and report the exact
     state.
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
