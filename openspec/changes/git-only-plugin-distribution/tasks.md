## 1. Track the bundles and point the servers at them

- [x] 1.1 In each of the five `packages/*/.gitignore`, replace the `dist/` line with `dist/*` followed by `!dist/bundle.js`, and update the comment above it, which currently reads "CI publishes bundle.js to npm". Verify with `git check-ignore -v packages/<pkg>/dist/bundle.js` for all five: the file must not be ignored, and the rest of `dist/` must still be.
<!-- status: completed -->
- [x] 1.2 Run `npm run clean && npm run build && npm run bundle` at the root, then `git add` all five `packages/*/dist/bundle.js`. Confirm `git status --porcelain` shows exactly five new bundle paths and no other `dist/` content.
<!-- status: completed -->
- [x] 1.3 Rewrite all five `packages/*/.mcp.json` to `{"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/bundle.js"]}` under the existing server name, matching the shape `55a1a08`'s parent shipped.
<!-- status: completed -->
- [x] 1.4 Remove `files` and the `prepublishOnly` script from all five `packages/*/package.json`. Leave `main`, `bin`, `version`, and every other script in place.
<!-- status: completed -->

## 2. Move the shipping proof out of files[]

- [x] 2.1 In `scripts/ci/lib/plugin-checks.mjs`, delete the `files[]` reachability rules and extend the existing git-tracked assertion to also cover each package's `dist/bundle.js` and every hook command target resolved from `plugin.json`. A skill, agent, hook script, or bundle that git does not track must still fail.
<!-- status: completed -->
- [x] 2.2 Add a test fixture pair for the new assertion, one passing and one failing, matching how `check-skill-hygiene.test.mjs` gives every rule both. A rule that cannot fail is the failure mode this repo already guards against.
<!-- status: completed -->
- [x] 2.3 Delete `scripts/ci/check-pack.mjs` and `scripts/ci/detect-releases.mjs`. Grep the repo for both filenames and remove every remaining reference.
<!-- status: completed -->
- [x] 2.4 Run `node scripts/ci/validate-plugins.mjs` locally. It must pass against the tracked bundles from 1.2.
<!-- status: completed -->

## 3. Rework CI

- [x] 3.1 In `.github/workflows/npm-publish.yml`, delete the five `publish-*` jobs, the `workflow_dispatch` `package` input, the `releases` output on `build-test`, and the `Detect releases` step.
<!-- status: completed -->
- [x] 3.2 In `static-analysis`, change `npm run bundle -w packages/dod-guard` to `npm run bundle` so all five bundles are rebuilt, and update the comment above it to say it now also refreshes the tracked bundles.
<!-- status: completed -->
- [x] 3.3 Update the `Commit & push autofixes and tightened baselines` step's commit message so it names the rebuilt bundles alongside the Biome autofixes, and confirm `git add -A` picks up `packages/*/dist/bundle.js` now that it is no longer ignored.
<!-- status: completed -->
- [x] 3.4 In `package-integrity`, delete the `Tarball contents` step. Keep `npm run bundle` and the `Bundle MCP handshake` step, which now guards what users actually run.
<!-- status: completed -->
- [x] 3.5 Rewrite the workflow's header comment and the job table it describes, then rename the file to `.github/workflows/ci.yml` with `git mv`. Confirm `static-analysis` is the only job in the final file holding `contents: write` and pushing.
<!-- status: completed -->
- [x] 3.6 Confirm the tracked bundle is invisible to every source-reading gate: `quality-scan` runs with `--exclude=/dist/`, Biome reads only `packages/*/src/` and `scripts/ci/`, and `check-coverage.mjs` matches through source maps. Run `node scripts/ci/check-coverage.mjs` and the quality scan locally and check that neither reports a new file.
<!-- status: completed -->

## 4. Reconcile the documentation

- [x] 4.1 Rewrite the "Publishing workflow (CRITICAL)" section of the root `CLAUDE.md`. Release is now: push to master, wait for CI green, `/plugin update` plus `/reload-plugins`. Remove the version-bump-is-the-release-instruction rule, the `detect-releases.mjs` description, and the `check-pack` row from the gates table. Add that CI owns the tracked bundle.
<!-- status: completed -->
- [x] 4.2 Rewrite `packages/dod-guard/skills/publish/SKILL.md` for the new flow: no version gate, no npm, no waiting on a publish job. Keep the local gate run it does before pushing.
<!-- status: completed -->
- [x] 4.3 Update every `packages/*/CLAUDE.md`, `packages/dod-guard/README.md`, and `packages/dod-guard/USAGE.md` passage that describes npm installation or the publish pipeline.
<!-- status: completed -->
- [x] 4.4 Run `node scripts/ci/check-skill-hygiene.mjs` and `openspec validate --all --strict --no-interactive`, then `npm test` at the root. All three must pass.
<!-- status: completed -->

## 5. Retire the npm packages

- [ ] 5.1 Confirm the git path works end to end first: `/plugin update` plus `/reload-plugins`, then check that dod-guard and quality-guard both answer an MCP `tools/list`. Do not proceed past this until they do.
- [ ] 5.2 Ask the user to run `npm login`, since `npm whoami` returns 401 on this machine and login is interactive.
- [ ] 5.3 Run `npm deprecate <pkg>@"*" "Moved to the git marketplace at github.com/TychoHenzen/dod-guard - install with /plugin marketplace add, not npm."` for `dod-guard`, `quality-guard`, `evomcp`, `gitevo`, and `obsidian-rag`. Verify each with `npm view <pkg> deprecated`.
