---
name: publish
description: Release changed dod-guard marketplace plugins through a functional or maintenance-only path with required validation and cache refresh.
---

# Publish dod-guard marketplace changes

Use this skill only when the user explicitly asks to publish or release a
completed change in this monorepo.

## Release model

This repository is a Claude Code and Codex plugin marketplace. Nothing
publishes to npm. A plugin release is a reviewed pull request merged into
`master`, followed by a green CI run and each client's marketplace refresh.

The root `.claude-plugin/marketplace.json` is the only marketplace manifest.
Every changed shipped plugin needs matching version bumps in
`.claude-plugin/plugin.json` and, when present, `.codex-plugin/plugin.json`.
Those versions are cache keys, so a client can retain old plugin content without
the bump.

## Procedure

1. Inspect `git status --short`, the current branch, and `gh repo view`. A
   dirty workspace is the release input. Include every pending change in this
   release. Do not filter or leave changes behind.
2. Classify the complete pending tree before requiring a PBI or pull request.
   Treat changes as `functional` when they alter runtime code, plugin manifests,
   plugin version or marketplace behavior, MCP or hook wiring, or any other
   installed behavior. Treat changes as `maintenance-only` only when they are
   limited to documentation, skill or agent prose, tests, CI configuration,
   generated reports, or equivalent non-product maintenance. Inspect file
   contents when a path classification is unclear. If any file is functional,
   use the functional path for the whole release.
3. Confirm each changed plugin's Claude Code and Codex manifest versions and
   descriptions match its shipped skills or agents. Update the root marketplace
   description if it states a changed skill count.
4. Invoke `/commit` for all pending changes. `/commit` owns staging, the commit
   message, push, and remote sync. Do not manually stage, commit, or push a
   subset of the release.
5. Run the release gates from the repository root:

   ```text
   npm run build
   npm test
   npm run bundle
   node scripts/ci/validate-plugins.mjs
   npx @biomejs/biome check packages/*/src/ scripts/ci/ --no-errors-on-unmatched
   ```

6. If a release gate generates tracked changes, invoke `/commit` again so every
   pending change reaches the release branch.
7. For a `maintenance-only` release, check whether the target branch accepts a
   direct push. Push the committed release only when the repository permits it.
   If branch protection requires a pull request, stop and report that exact
   condition. Do not create a PBI, invoke `/submit-draft-pr`, bypass protection,
   or claim that the release completed.
8. For a `functional` release, invoke `/submit-draft-pr` with the parent PBI
   number. Do not create or update the pull request yourself. Never approve,
   mark ready, merge, or close that pull request.
9. After a human merges a functional release, inspect the merge commit's CI run. It must pass
   `build-test`, `plugin-config`, `static-analysis`, and `package-integrity`.
10. After a direct maintenance push or a merged functional release has green CI,
   refresh both clients:

   ```text
   Claude Code: /plugin update, then /reload-plugins
   Codex: codex plugin marketplace upgrade dod-guard-monorepo
   Codex: codex plugin add dod-guard@dod-guard-monorepo
   ```

   Confirm `codex plugin list` reports the released version. Do not copy files
   into either client cache manually.

## Boundaries

- Do not create npm releases or tags.
- Do not bypass required pull-request review.
- Do not call a release complete until the merged commit has green CI.
