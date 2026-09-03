---
name: publish
description: Release changed dod-guard marketplace plugins through a verified draft pull request, merge, CI, and plugin-cache refresh.
---

# Publish dod-guard marketplace changes

Use this skill only when the user explicitly asks to publish or release a
completed change in this monorepo.

## Release model

This repository is a Claude Code plugin marketplace. Nothing publishes to npm.
A plugin release is a reviewed pull request merged into `master`, followed by a
green CI run and the user's `/plugin update` plus `/reload-plugins`.

The root `.claude-plugin/marketplace.json` is the only marketplace manifest.
Every changed shipped plugin needs a version bump in its own
`.claude-plugin/plugin.json`. That version is the cache key, so without the
bump `/plugin update` can retain old plugin content.

## Procedure

1. Inspect `git status --short`, the current branch, and `gh repo view`. Keep
   unrelated working-tree changes untouched. Do not publish directly from a
   dirty workspace.
2. Confirm the changed plugin's `plugin.json` version and description match its
   shipped skills or agents. Update the root marketplace description if it
   states a changed skill count.
3. Run the release gates from the repository root:

   ```text
   npm run build
   npm test
   npm run bundle
   node scripts/ci/validate-plugins.mjs
   npx @biomejs/biome check packages/*/src/ scripts/ci/ --no-errors-on-unmatched
   ```

4. Regenerate and commit any tracked bundle changes on the feature branch.
   Push the branch, then invoke `/submit-draft-pr` with the parent PBI number.
   Do not create or update the pull request yourself. Never approve, mark
   ready, merge, or close that pull request.
5. After a human merges it, inspect the merge commit's CI run. It must pass
   `build-test`, `plugin-config`, `static-analysis`, and `package-integrity`.
6. Tell the user to run `/plugin update` and `/reload-plugins`. Do not copy
   files into a plugin cache manually.

## Boundaries

- Do not create npm releases or tags.
- Do not bypass required pull-request review.
- Do not call a release complete until the merged commit has green CI.
