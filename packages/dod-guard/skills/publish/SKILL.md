---
name: publish
description: Publish or release workflow for the dod-guard monorepo - run every CI gate locally, commit, push to master, watch CI (including its follow-up autofix commit), then tell the user to run /plugin update and /reload-plugins. Every plugin needs a plugin.json version bump for its own content changes so the plugin cache re-copies.
allowed-tools: [Read, Edit, Write, Glob, Bash(git *), Bash(npm *), Bash(npx *), Bash(gh *), Bash(rtk *), Bash(ls *), Bash(node *)]
---

You are a publish workflow guide for the dod-guard monorepo. Follow this procedure exactly.

## Prerequisites

- Working directory must be the monorepo root
- Must be on `master` branch
- Must have `gh` CLI authenticated

## How releasing works here

**Nothing publishes to npm.** The marketplace installs straight from a git checkout of this repo, tracked `dist/bundle.js` included. A release is: push to master, wait for CI to go green, then `/plugin update` + `/reload-plugins`.

`static-analysis` rebuilds the tracked bundles and, if anything drifted, commits and pushes a follow-up `chore: apply Biome autofixes, tightened baselines and rebuilt bundles [skip ci]` commit. That means the commit you pushed is not necessarily the one that ends up on master - always resync after CI finishes (Step 6).

**Every plugin's `plugin.json` version is a cache key, not a release trigger.** `/plugin update` copies files into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. A content change with no version bump is invisible: the cache already has that version and does not re-copy. Bump the version in `<plugin>/.claude-plugin/plugin.json` (root-level for `plugins/natural-output-style`, or `packages/<name>/.claude-plugin/plugin.json` for package plugins) whenever you change any file that plugin ships.

There is no other reason to touch a version number. `validate-plugins.mjs` only checks that `plugin.json`'s version, when present, matches `package.json` - it does not require either to change.

## Environment facts (do not re-derive)

- Shell is **Git Bash on Windows**. `/dev/stdin` does NOT work - `cat x.json | node -e "...readFileSync('/dev/stdin')"` fails with `ENOENT: C:\dev\stdin`. To inspect JSON, use the **Read tool** or `node -e "console.log(require('./path/file.json').description)"`.
- Root `package.json` scripts include `clean`, `build`, `test`, and `bundle`.
- The only marketplace is the repository root `.claude-plugin/marketplace.json`. Package plugin directories contain `plugin.json`, never `marketplace.json`; `validate-plugins.mjs` rejects duplicates.
- CI runs Biome autofix, the ratchets, and a bundle rebuild on every push to master, and if any of that changed anything, commits and pushes the `[skip ci]` commit described above. So remote master is frequently AHEAD of local after a push. Step 0 exists because of this.
- Bash tool default timeout is 2 minutes. Any `gh run watch` or long CI wait MUST pass an explicit longer `timeout` (600000).

## Two entry paths

**Path A: Working tree has uncommitted changes** (most common)
-> Steps 0-5.

**Path B: Working tree is clean, commit already on HEAD**
-> HEAD has the changes. If HEAD is already pushed, CI has already decided; go to Step 6. If HEAD is unpushed, run Step 2's gates against HEAD, then go to Step 4 (nothing to commit).

---

### Step 0: Sync with remote FIRST (mandatory)

```bash
git fetch origin master
git rev-list HEAD..origin/master --count
```

- Count `0` -> in sync, proceed.
- Count `>0` and working tree is **clean** -> `git rebase origin/master`, proceed.
- Count `>0` and working tree is **dirty** -> `git stash && git rebase origin/master && git stash pop`. Resolve any conflict (your side wins over CI's reformat), then proceed.

### Step 1: Check plugin metadata (all changed plugins)

For each plugin whose files changed (any change under a `packages/<name>/` or `plugins/<name>/` tree, or under the root `.claude-plugin/`), decide whether that plugin needs a `plugin.json` version bump - see "How releasing works here" above.

Discover which metadata files actually exist - never assume:
```bash
ls packages/*/.claude-plugin/ plugins/*/.claude-plugin/ .claude-plugin/
```

While you are here, check whether skills or agents were added, removed, or moved, and update descriptions that name or count them (`plugin.json`, `package.json` `description`, `packages/<name>/CLAUDE.md` skill table, root `.claude-plugin/marketplace.json`). `validate-plugins.mjs` in Step 2 fails the build on stale counts and on `/skill` mentions that name a skill nobody ships, so fix them here rather than discovering it in CI.

**Agent count != skill count.** Agents under `packages/<name>/agents/` are separate from skills.

### Step 2: Build, test, bundle, gate

All of these must pass before committing - they are exactly what CI runs, so a failure here is a failure there:

```bash
npm run clean && npm run build
```
```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
```
```bash
npm run bundle
```
```bash
git diff --exit-code -- package-lock.json
```

CI dies at this exact step when the lockfile is out of sync with the workspaces; run `npm install` and commit the result if it fails.

`npm test` emits a large amount of TAP output; always filter it so it isn't spilled to a persisted-output file. Every suite must show `# fail 0`.

Then the CI gates, locally, in the order CI runs them:
```bash
node --test scripts/ci/validate-plugins.test.mjs
node scripts/ci/validate-plugins.mjs
node --test scripts/ci/check-skill-hygiene.test.mjs
node scripts/ci/check-skill-hygiene.mjs
node --test scripts/ci/check-spec-hygiene.test.mjs
node scripts/ci/check-spec-hygiene.mjs
openspec validate --all --strict --no-interactive
node scripts/ci/check-tests-present.mjs
node scripts/ci/check-audit.mjs
node scripts/ci/check-coverage.mjs
node scripts/ci/check-coverage-gate.mjs
node packages/quality-guard/scripts/check-skips.mjs .
npx @biomejs/biome check packages/*/src/ scripts/ci/ --no-errors-on-unmatched
node "packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs" packages --exclude=/dist/ --exclude=node_modules --rules="file-length,function-length,complexity,param-count,nesting-depth,types-per-file,duplicate-block,else-branch,unnamed-tuple,dead-export,unused-local,test-only-export,commented-out-code,todo-marker,stateless-method,comment-bloat,comment-restates-code,assumption-marker" --baseline=.github/quality/quality-baseline.json --fail-on=regression
node --test scripts/ci/smoke-bundle-standalone.test.mjs scripts/ci/smoke-cli-bundle.test.mjs
for p in dod-guard quality-guard code-explorer; do node scripts/ci/smoke-bundle.mjs "$p"; done
node scripts/ci/smoke-cli-bundle.mjs fossil
node scripts/ci/smoke-bundle-standalone.mjs
```

`check-skips.mjs` hard-fails CI on any unacknowledged `.quality-skip` waiver - it appears in no CI job name, so it is easy to forget locally. The quality scan lives under `packages/quality-guard/skills/`, not `scripts/ci/`, for the same reason; copy its invocation from the `Quality ratchet (structure)` step in `.github/workflows/ci.yml` if that command ever changes there.

If anything fails, fix it before proceeding.

### Step 3: Commit (Path A only)

Commit **inline here**. Do NOT invoke the `/commit` skill - it has its own message conventions and push behavior.

```bash
rm -rf .refactor-session/ .tdd-session/ 2>/dev/null
git add -A
git diff --staged --stat
```

Review the staged CLAUDE.md diffs (`git diff --staged -- CLAUDE.md packages/*/CLAUDE.md`) - if the change added modules, CLI entry points, or architectural rules, CLAUDE.md must reflect them.

Write a commit message describing what changed and why, following this repo's existing commit style (`git log --oneline -10` for examples).

Commit with `git commit -m "..."`.

### Step 4: Push

```bash
git push origin master
```

That is the entire release trigger. Nothing publishes anywhere; CI's job is to gate and to rebuild the tracked bundles.

If the push is rejected (`! [rejected] master -> master (fetch first)`), CI pushed its own autofix/bundle/baseline commit while you worked:
```bash
git fetch origin master
git log --oneline HEAD...origin/master
git rebase origin/master
git push origin master
```
On conflict, the remote side is CI's reformat or bundle rebuild of code your commit moved or rewrote - **your version wins** for source, but let CI's rebuilt `dist/bundle.js` stand: resolve source conflicts to your side, `git add <file>`, `git rebase --continue`.

### Step 5: Monitor CI

```bash
COMMIT_SHA=$(git rev-parse HEAD)
for i in $(seq 1 6); do
  RUN_ID=$(gh run list --commit "$COMMIT_SHA" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
  [ -n "$RUN_ID" ] && break
  sleep 5
done
echo "RUN_ID=$RUN_ID"
```

Then, **with `timeout: 600000` on the Bash call**:
```bash
gh run watch <RUN_ID> --exit-status 2>&1 | tail -30
```

`status` and `conclusion` are separate fields, and `conclusion` is empty while `status=in_progress`. Never read a blank conclusion as success:
```bash
gh run view <RUN_ID> --json jobs --jq '.jobs[] | "\(.name): status=\(.status) conclusion=\(.conclusion)"'
```

Expect `success` for all four jobs: `build-test`, `plugin-config`, `static-analysis`, `package-integrity`.

### Step 6: Re-sync and hand off

```bash
git fetch origin master
git rev-list HEAD..origin/master --count
```

If the count is `>0`, `static-analysis` pushed its follow-up autofix/bundle/baseline commit - `git rebase origin/master` (or `git pull --rebase`) to pick it up so local master isn't stale for next time.

Once CI is green and local master is in sync, tell the user to run `/plugin update` then `/reload-plugins` to pick up the change. Do not run either yourself - they act on the user's own Claude Code session, not this one.

Report final results.

## Critical Rules

1. **Never manually copy `dist/bundle.js` into `~/.claude/plugins/cache/`** - always publish via master -> CI -> `/plugin update`
2. **Nothing publishes to npm and no tags get created** - a version bump is a changelog entry, not a trigger
3. **Always `git fetch` + rebase before starting (Step 0)** - CI pushes autofix, bundle, and baseline commits to master
4. **Build, test, bundle and the `scripts/ci/` gates must pass before committing** - the full list is in Step 2
5. **Never invoke `/commit` from this skill** - commit inline in Step 3
6. **Every plugin needs its own `plugin.json` version bump for its own content changes** - the plugin cache is keyed by version, so an unchanged version means an unchanged cache
7. **Re-sync after CI (Step 6) before telling the user to update** - `static-analysis` may have pushed a commit after yours
