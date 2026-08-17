---
name: publish
description: Publish workflow for the dod-guard monorepo - npm packages get version bump, gate check, commit, push, CI monitoring. Code-only plugins under plugins/ need a plugin.json version bump too.
allowed-tools: [Read, Edit, Write, Glob, Bash(git *), Bash(npm *), Bash(npx *), Bash(gh *), Bash(rtk *), Bash(ls *), Bash(node *), AskUserQuestion]
---

You are a publish workflow guide for the dod-guard monorepo. Follow this procedure exactly.

## Prerequisites

- Working directory must be the monorepo root
- Must be on `master` branch
- Must have `gh` CLI authenticated

## How releasing works here

**A version in `package.json` that npm does not have is the release instruction.** Push it to master and CI publishes it. Nothing else triggers a release.

**Never create a `<package>-v<version>` tag by hand.** CI creates it after a successful publish, as a record of what shipped. A tag you push first makes CI's own tag push fail *after* it has already published to npm, leaving a broken run behind a successful release.

There is no way to land a version bump on master without releasing it. Keep the bump out of the commit until you mean it.

## Code-only plugins under `plugins/`

Plugins in `plugins/` (e.g. `natural-output-style`) have no npm package and no
CI publish job. They ship through the git-based marketplace: `/plugin update`
pulls the repo and copies files into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`.

The cache is **keyed by the `version` in `plugin.json`**. A content change
without a version bump is invisible: the cache already has that version and
does not re-copy. Bump the version in `plugins/<name>/.claude-plugin/plugin.json`
whenever you change any file the plugin ships, or the change will not reach
the user until some future unrelated bump forces a re-copy.

This applies to output styles, README files, and any other content the plugin
carries. There is no build step, no bundle, and no CI gate beyond
`validate-plugins.mjs`.

## Environment facts (do not re-derive)

- Shell is **Git Bash on Windows**. `/dev/stdin` does NOT work - `cat x.json | node -e "...readFileSync('/dev/stdin')"` fails with `ENOENT: C:\dev\stdin`. To inspect JSON, use the **Read tool** or `node -e "console.log(require('./path/file.json').description)"`.
- Root `package.json` scripts are exactly: `build`, `test`, `bundle`, `build:evomcp`, `build:gitevo`. **There is no `clean` script** - do not run `npm run clean`.
- Only `dod-guard` and `obsidian-rag` have `packages/<name>/.claude-plugin/marketplace.json`. `evomcp` and `gitevo` have **only** `plugin.json`. Never assume a per-package marketplace.json exists.
- CI runs Biome autofix on every push to master and, if it changed anything, **commits and pushes `chore: apply stricter Biome autofixes [skip ci]` back to master**. It also rewrites `.github/quality/` baselines when a ratchet improves. So remote master is frequently AHEAD of local after a publish. Step 0 exists because of this.
- Bash tool default timeout is 2 minutes. Any `gh run watch` or long CI wait MUST pass an explicit longer `timeout` (600000).

## Two entry paths

**Path A: Working tree has uncommitted changes** (most common)
-> Steps 0-6.

**Path B: Working tree is clean, commit already on HEAD**
-> HEAD has the changes. Run Steps 0-3 against `HEAD~1`. If HEAD is already pushed, CI has already decided; go to Step 7 and read the run. If HEAD is unpushed, skip Steps 4-5 and go to Step 6.

Run `node scripts/ci/detect-releases.mjs` at any time to see exactly what a push would publish.

---

### Step 0: Sync with remote FIRST (mandatory)

```bash
git fetch origin master
git rev-list HEAD..origin/master --count
```

- Count `0` -> in sync, proceed.
- Count `>0` and working tree is **clean** -> `git rebase origin/master`, proceed.
- Count `>0` and working tree is **dirty** -> `git stash && git rebase origin/master && git stash pop`. Resolve any conflict (your side wins over CI's Biome reformat), then proceed.

### Step 1: Detect all changed packages (automatic)

**Always publish every package with changes.** No asking.

**Path A (dirty working tree)**:
```bash
git status --short
```
`git status --short` is the reliable single view. (`git diff --cached --name-only` alone silently returns nothing when everything is unstaged - don't rely on it by itself.)

**Path B (clean working tree)**:
```bash
git diff --name-only HEAD~1
```

Map each changed file to its package under `packages/`. A package is "changed" if any file under `packages/<name>/` appears. Files outside `packages/` (workflows, root docs, `scripts/`) belong to no package and release nothing on their own.

Changes under `plugins/` are code-only plugin changes. They need a `plugin.json` version bump (see "Code-only plugins" above) but no npm publish.

If zero packages changed and no plugin content changed: "Nothing to publish." Stop.

### Step 2: Auto-determine version bump (semver)

```bash
node -e "['dod-guard','evomcp','gitevo','obsidian-rag'].forEach(p=>{try{console.log(p+': '+require('./packages/'+p+'/package.json').version)}catch(e){}})"
```

| Level | Criteria | Examples |
|-------|----------|----------|
| **major** | Breaking: deleted exported functions/types/classes, changed public API signatures, removed skills/MCP tools, deleted public-API source files | `src/index.ts` removes an exported function, deleted `skills/foo/` with no replacement |
| **minor** | New feature: new files in `src/`, new skills, new MCP tools, new scripts/tools, significant new capabilities | Added `skills/new-feature/`, new `src/cli.ts`, new exported functions |
| **patch** | Everything else: refactoring, moving/renaming files, bug fixes, doc updates, dependency bumps, config changes, internal cleanup | Moved `skills/x/agents/` -> `agents/`, updated CLAUDE.md, tweaked esbuild config, rebuilt bundle |

For each changed package run `git diff -- packages/<name>/` (and `--cached` if anything is staged), then check:
1. **Deleted files** part of the public API surface -> **major**
2. **New source files / skill dirs / tool registrations** -> **minor**
3. **Modified only** -> **patch**

Untracked files (`??`) count as new files -> **minor** if substantive (`src/`, `skills/`, `scripts/`), else **patch**.

Compute: major `X+1.0.0` . minor `X.Y+1.0` . patch `X.Y.Z+1`. **If uncertain between two levels, pick the higher.**

**Display the decision table** with a one-line rationale per package, then apply the bumps. No asking.

### Step 3: Update plugin metadata (all changed packages)

For EACH changed package, check whether skills/agents were added, removed, or moved, and update descriptions that name or count them.

Discover which metadata files actually exist - never assume:
```bash
ls packages/*/.claude-plugin/ .claude-plugin/
```

- `packages/<name>/.claude-plugin/plugin.json` - always exists
- `packages/<name>/.claude-plugin/marketplace.json` - **only dod-guard and obsidian-rag**
- `.claude-plugin/marketplace.json` (root) - describes all plugins
- `packages/<name>/package.json` `description` - often repeats the skill list
- `packages/<name>/CLAUDE.md` - skill table

Read these with the **Read tool** (see Environment facts - no `/dev/stdin` piping).

```bash
for p in dod-guard evomcp gitevo obsidian-rag; do echo "$p skills: $(ls -d packages/$p/skills/*/ 2>/dev/null | wc -l) agents: $(ls packages/$p/agents/*.md 2>/dev/null | wc -l)"; done
```

`validate-plugins.mjs` in Step 4 fails the build on stale counts and on `/skill` mentions that name a skill nobody ships, so fix them here rather than discovering it in CI.

**Agent count != skill count.** Agents under `packages/<name>/agents/` are separate from skills.

### Step 4: Build, test, bundle, gate

All of these must pass before committing - they are exactly what CI runs, so a failure here is a failure there:

```bash
npm run build -w packages/gitevo && npm run build
```
```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
```
```bash
npm run bundle
```

`npm test` emits ~180KB of TAP output; always filter it so it isn't spilled to a persisted-output file. Every suite must show `# fail 0`.

Then the CI gates, locally:
```bash
node scripts/ci/validate-plugins.mjs
node scripts/ci/check-tests-present.mjs
node scripts/ci/check-audit.mjs | tail -1
for p in dod-guard evomcp gitevo obsidian-rag; do node scripts/ci/check-pack.mjs $p && node scripts/ci/smoke-bundle.mjs $p | head -1; done
node scripts/ci/detect-releases.mjs
```

`smoke-bundle` must report the new version - it reads `serverInfo.version` from the running bundle and compares it to package.json, so it catches a bundle you forgot to rebuild. `detect-releases` must list exactly the packages you bumped.

If anything fails, fix it before proceeding.

### Step 5: Commit (Path A only)

Commit **inline here**. Do NOT invoke the `/commit` skill - it has its own message conventions and push behavior.

```bash
rm -rf .solve-session/ .refactor-session/ .tdd-session/ 2>/dev/null
git add -A
git diff --staged --stat
```

Review the staged CLAUDE.md diffs (`git diff --staged -- CLAUDE.md packages/*/CLAUDE.md`) - if the change added modules, CLI entry points, or architectural rules, CLAUDE.md must reflect them.

Commit message (one package):
```
chore(<package>): bump to v<X.Y.Z>

- UPD: version <old> -> <new> (<major|minor|patch>: <one-line reason>)
```

Multiple packages:
```
chore: bump <pkg1> v<X.Y.Z>, <pkg2> v<A.B.C>

- UPD: <pkg1> <old> -> <new> (<level>: <reason>)
- UPD: <pkg2> <old> -> <new> (<level>: <reason>)
```

Commit with `git commit -m "..."`.

### Step 6: Push

```bash
git push origin master
```

That is the entire release trigger. No tags - CI creates them.

If the push is rejected (`! [rejected] master -> master (fetch first)`), CI pushed a Biome autofix or a tightened baseline while you worked:
```bash
git fetch origin master
git log --oneline HEAD...origin/master
git rebase origin/master
git push origin master
```
On conflict, the remote side is CI's reformat of code your commit moved or rewrote - **your version wins**: resolve to your side, `git add <file>`, `git rebase --continue`.

### Step 7: Monitor CI

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

Expect `success` for `build-test`, `plugin-config`, `static-analysis`, `package-integrity`, and `publish-<pkg>` for each bumped package. `skipped` for unbumped packages is correct.

If a publish job fails at its **Tag the release** step, the package is already on npm - do not re-run the publish. Create the missing tag locally and push just that tag.

### Step 8: Verify and re-sync

```bash
npm view <package-name> version   # for each published package
git fetch origin master --tags
git tag --points-at HEAD | grep -- '-v'
git rev-list HEAD..origin/master --count
```

Each package must show the new version, and CI's tag must be present at HEAD. If the commit count is `>0`, `git rebase origin/master` to pick up CI's autofix or baseline commit so local master isn't stale for next time.

Report final results.

## Critical Rules

1. **Never manually copy `dist/bundle.js` into `~/.claude/plugins/cache/`** - always publish via master -> CI -> npm -> `/plugin update`
2. **Never create release tags by hand** - CI owns them; a pre-existing tag breaks CI's tag push after it has already published
3. **Always `git fetch` + rebase before starting (Step 0)** - CI pushes autofix and baseline commits to master
4. **A version bump on master always publishes** - there is no opt-out, so don't bump speculatively
5. **Build, test, bundle and the `scripts/ci/` gates must pass before committing** - and there is no `npm run clean`
6. **Never invoke `/commit` from this skill** - commit inline in Step 5
7. **Plugin metadata is asymmetric** - only dod-guard and obsidian-rag have a per-package marketplace.json
8. **Code-only plugins need a version bump too** - the plugin cache is keyed by version, so unchanged version = unchanged cache
