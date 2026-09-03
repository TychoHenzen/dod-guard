## Context

See proposal.md - Why.

Two facts from the repo shape everything below.

First, this exact invocation shape already worked. Commit `55a1a08`'s parent
shipped `node ${CLAUDE_PLUGIN_ROOT}/dist/bundle.js` in all five `.mcp.json`
files. `55a1a08` replaced it with `npx`, and its message gives the reason:
"The binary comes from npm, so it does not need to be in git." The variable
expands. Nothing about it broke.

Second, only `static-analysis` may push. CLAUDE.md records why
`check-coverage-gate.mjs` lives in `static-analysis` and not `plugin-config`:
`plugin-config` has no push permission, and a second job pushing would race
`static-analysis`'s own push non-fast-forward. Today `static-analysis` builds
only dod-guard's bundle; the other four are built in `package-integrity`, which
has no `contents: write`.

## Goals / Non-Goals

**Goals:**

- One OS process per MCP server on Windows.
- The tracked bundle is always built from the pushed source, never from a
  developer's working tree.
- Every guarantee `check-pack.mjs` gave survives its deletion.
- Exactly one CI job pushes.

**Non-Goals:**

- Reducing the number of enabled plugins. That is machine config and was handled
  outside this change.
- Sweeping the 32 stale sha checkouts under `~/.claude/plugins/cache/dod-guard/`.
  Separate item, separate approval.
- Unpublishing anything from npm. Deprecation only.
- Making the bundle build reproducible byte-for-byte. esbuild is deterministic
  enough for the same source and version; version drift in esbuild will churn the
  diff once and then settle.

## Decisions

### CI rebuilds and commits the bundle; it does not gate on drift

A gate that fails when the tracked bundle differs from a fresh build would redden
master on every source push, because the developer's push necessarily precedes
the rebuild. The rebuild-and-commit is the fix, so there is nothing left to fail
on.

Alternative considered: require the developer to build and commit the bundle,
with CI verifying. Rejected because it makes every source edit a two-step commit
and puts a Windows-built artifact in a Linux-consumed tree. The existing workflow
already carries `git config core.fileMode false` precisely because Windows builds
set `+x` on `bundle.js`.

`smoke-bundle.mjs` stays in `package-integrity` as a read-only check against the
bundle that job builds itself. It never touches the tracked copy, so it cannot
race the push.

### All five bundle builds move into `static-analysis`

`static-analysis` already runs `npm run bundle -w packages/dod-guard` for the
coverage-gate ratchet. It becomes `npm run bundle` for all five, and the commit
step picks up whichever bundles changed. `package-integrity` keeps its own
independent `npm run bundle`, which now writes to a working tree it does not
push. One pusher, no race.

### The first commit carries hand-built bundles

If `.mcp.json` lands pointing at `dist/bundle.js` before any commit populates
that path, a `/plugin update` in that window leaves all five servers unable to
start. So the commit that flips `.mcp.json` also carries five locally built
bundles. CI takes over from the next push.

This is the one place a Windows-built bundle enters git. The mode bit is already
ignored, and CI rebuilds on the next push regardless.

### `.gitignore` uses `dist/*` plus a negation

Git does not descend into an excluded directory, so `dist/` followed by
`!dist/bundle.js` cannot re-include the file. Each package's ignore becomes
`dist/*` with `!dist/bundle.js` after it. The change verifies this per package
with `git check-ignore -v`, rather than trusting the rule.

### `files[]` rules become git-tracked assertions

`check-pack.mjs` proved that every skill, agent, and hook target reached the npm
tarball. With no tarball, that proof has no subject. But the underlying risk is
unchanged: a skill directory or hook script can still silently stop shipping,
because the git checkout is now the only delivery path.

`validate-plugins.mjs` already asserts that every skill, agent, and
`.claude-plugin` file is tracked by git. That rule absorbs the old `files[]`
reachability rules, extended to cover hook command targets and each package's
`dist/bundle.js`. Deleting the `files[]` checks without that extension would
leave a real hole.

Alternative considered: keep `files[]` and `check-pack.mjs` as a redundant second
opinion. Rejected because `files[]` would then describe a tarball nobody builds,
which is the kind of stale second home the repo's own skill-hygiene rules exist
to prevent.

### Deprecate rather than unpublish

npm's free unpublish window is 72 hours; only `dod-guard@4.6.0` is inside it.
Unpublishing is one-way: those name plus version pairs can never be republished
and the names lock for 24 hours. Deprecation is reversible with
`npm deprecate <pkg>@"*" ""`, keeps the names, and turns any surviving `npx`
invocation into a warning rather than a hard failure.

`npm whoami` currently returns 401 on this machine, so the deprecation step needs
an interactive `npm login` first. It is the last task and the only one that
touches anything outside the repo.

## Risks / Trade-offs

- **A source push and its CI bundle rebuild are two different shas.** A
  `/plugin update` between them installs a checkout whose bundle is one commit
  stale. -> Same wait-for-CI discipline the npm publish already required. The
  release instruction changes from "bump the version" to "push, wait for green,
  then update".

- **Committed build output churns the diff.** -> `dist/bundle.js` is excluded
  from every gate that reads source: `quality-scan` runs with `--exclude=/dist/`,
  Biome reads `packages/*/src/` and `scripts/ci/` only, and the coverage ratchet
  matches `dist/**/*.js` through source maps rather than scanning the bundle as
  source. Verify each of these still holds after the file becomes tracked.

- **Losing the publish pipeline removes the version-bump discipline.** Versions
  in `package.json` stop meaning anything enforceable. -> `validate-plugins.mjs`
  keeps its rule that `plugin.json`'s version, when present, matches
  `package.json`. Versions become a changelog, not a trigger. The proposal states
  this as intended, not accidental.

- **`bin` and `main` fields survive with nothing consuming them.** -> Keep both.
  npm workspaces link `bin` into the repo's own `node_modules/.bin`, which is how
  `dod-guard` is reachable as a command inside this checkout. Removing them would
  break local use for no gain.

- **An esbuild version bump rewrites all five bundles at once.** -> Expected and
  harmless; CI commits it as one autofix push.

## Migration Plan

1. Land `.mcp.json`, `.gitignore`, and the five hand-built bundles in one commit,
   so no window exists where the configured path is empty.
2. Land the CI changes on the next push. From then on CI owns the bundle.
3. Deprecate on npm last, after the git path is proven by a real
   `/plugin update` plus `/reload-plugins`.

Rollback: revert the `.mcp.json` commit. `npx <package>` starts working again
immediately, because nothing was unpublished.
