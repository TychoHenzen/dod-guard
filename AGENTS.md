# AGENTS.md

This file provides shared guidance to coding agents working in this repository.

## Monorepo overview

npm workspaces monorepo with two MCP server plugins for Claude Code, distributed through the git-based marketplace. Each package builds to a single `dist/bundle.js` (esbuild), tracked in git; CI rebuilds and commits it on every push to master. The marketplace ships that bundle alongside each package's skills, agents, and plugin config.

| Package | npm name | Purpose |
|---------|----------|---------|
| `dod-guard` | `dod-guard` | Anti-cheat DoD verification with behavioral predicates. Ships `/interview`, `/clean-house`, `/step-by-step`, `/adversarial-workflow`, `/test-integrity-checker`, `/blind-rewrite`, `/tighten`, `/doc-reconcile`, `/skill-debug`, `/skill-migrate`, `/opsx-continue` skills. |
| `quality-guard` | `quality-guard` | Structural quality gate: MCP tools, a PostToolUse ratchet hook, and the `/quality-refactor` skill with its scanner. |

**Each package has its own AGENTS.md** with detailed architecture, file responsibilities, and domain-specific rules. Read it before working in that package.

### Plugins that ship no code

`plugins/` holds plugins with no MCP server: a `.claude-plugin/plugin.json` plus content Claude Code loads directly. They are not npm workspaces, and the `packages/` rules about `dist/bundle.js` and `.mcp.json` do not apply. They still need a root marketplace entry, and `validate-plugins.mjs` checks their manifest, their output-style frontmatter, and that git tracks every file.

| Plugin | Ships |
|--------|-------|
| `natural-output-style` | The `Natural` output style. Plain prose every turn: common words, short sentences, no filler. Mirrors what `ste-lint` checks mechanically. |

Put a plugin here only while it has no server. The moment it needs one, it becomes a package.

### Local tools that ship nothing

`tools/` holds developer utilities that run from a checkout and never publish. They are not npm workspaces and not plugins, so no version bump, no `dist/bundle.js`, and no marketplace entry applies.

| Tool | Runs with |
|------|-----------|
| `openspec-dashboard` | `node tools/openspec-dashboard/serve.mjs`. Read-only browser view over the OpenSpec CLI, across every project in `~/.openspec-dashboard/projects.json`. |

Every CI gate is scoped away from this directory. The quality scan reads `packages`, Biome reads `packages/*/src/` and `scripts/ci/`, and `validate-plugins.mjs` reads `packages/` and `plugins/`. So a tool here is checked by review alone, not by the ratchets. Keep one dependency-free and small enough to read, or promote it to a package.

## Build, test, lint

All commands from the **monorepo root**:

```bash
# Clean build (recommended — removes stale .js from deleted .ts sources)
npm run clean && npm run build

# Build all packages (tsc).

npm run build -w packages/<name>     # single package
npm run build                         # all packages

# Test all packages
npm test                              # tsc + node --test (all packages)
npm test -w packages/<name>           # single package

# Run a single test file
node --experimental-test-module-mocks --test "packages/<name>/dist/<file>.test.js"

# Bundle for distribution
npm run bundle -w packages/<name>     # single package
npm run bundle                        # all packages

# Lint / format
npx @biomejs/biome check packages/*/src/
npx @biomejs/biome check --write packages/*/src/   # auto-fix
```

## Tech stack

- **Runtime**: Node 18+ (ESM modules, `"type": "module"`)
- **Language**: TypeScript 5.7, target ES2022, Node16 module resolution
- **Bundler**: esbuild → `dist/bundle.js` with `#!/usr/bin/env node` banner
- **Test runner**: Node.js native test runner (`node --test`) with `--experimental-test-module-mocks`
- **Linter/formatter**: Biome 2.5.3 (indent: 2 spaces, line width: 120)
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.29.0

## Publishing workflow (CRITICAL)

Never deploy by manually copying `dist/bundle.js` into a runtime cache. Push to master and let CI rebuild and commit the tracked bundle instead.

The flow:

1. Push to `master` - that is the whole release instruction.
2. CI runs every gate; `static-analysis` rebuilds both `dist/bundle.js` files and commits any drift.
3. Wait for CI to go green before updating. A source push and its CI bundle rebuild can be two different commits.
4. Follow the consuming runtime's adapter instructions to refresh its plugin cache.

Nothing publishes to npm. A version bump in `package.json` is a changelog entry now, not a release trigger - `validate-plugins.mjs` still enforces that `plugin.json`'s version, when present, matches `package.json`.

**Marketplace**: Update `.claude-plugin/marketplace.json` in each package when adding/removing plugins or skills. The monorepo root `.claude-plugin/marketplace.json` describes both plugins for the git-based marketplace.

**CI behavior** (`.github/workflows/ci.yml`):
- Push to `master` -> every gate below runs.
- `workflow_dispatch` fallback for a manual run.

**Gates** - all four jobs must go green:

Adding a package is not finished until `npm install` has run at the root.
`npm ci` refuses a lock file that does not list every workspace, so CI dies at
its first step with `Missing: <name>@<version> from lock file`. Commit the
updated `package-lock.json` with the new package.

| Job | What it blocks on |
|-----|-------------------|
| `build-test` | tsc and `npm test` |
| `plugin-config` | `validate-plugins.mjs` (see below), `check-skill-hygiene.mjs` (see below), and `openspec validate --all --strict --no-interactive` |
| `static-analysis` | Biome (autofix + strict), four ratchets, and rebuilding and committing the tracked bundles - no separate drift gate, since a source push necessarily precedes CI's rebuild and rebuild-and-commit leaves nothing to fail on |
| `package-integrity` | `smoke-bundle.mjs` (the bundle completes an MCP initialize + tools/list, and reports the same version as package.json) - with no tarball check left, this handshake is the only thing between a bad build and a broken session |

`validate-plugins.mjs` checks, all hard-fail:

- **Manifest agreement** - plugin.json / .mcp.json / package.json / marketplace.json name the same plugin; `main` is `dist/bundle.js`; `repository.directory` is right; plugin.json `version`, if present, matches package.json.
- **Reachability** - `dist/bundle.js` must exist and be git-tracked; `.mcp.json` and `.claude-plugin/` are git-tracked; `skills/` and `agents/` are git-tracked when they exist; hook commands point at files that exist and are git-tracked; marketplace `source` paths resolve; every plugin appears in the root marketplace.
- **Skills and agents** - each skill directory has a SKILL.md whose frontmatter `name` matches the directory; each agent file's `name` matches its filename; both carry a description; `subagent_type: "<plugin>:<agent>"` references resolve.
- **Description honesty** - every `/slug` mentioned resolves to a skill that ships, "Ships N skills" matches the real count, and no mojibake or control characters (this is what shipped the double-encoded em-dash in `b4b2e13`).
- **Repo-wide content** - every JSON file parses; no `skills/` or `agents/` directory without a `plugin.json` above it; no credentials or `C:\Users\<name>` paths in shipped `.md`/`.json`; every skill, agent and `.claude-plugin` file is tracked by git.

`check-skill-hygiene.mjs` keeps a skill from taking back a job it does not own.
OpenSpec owns a change's artifacts and the rules for authoring them, dod-guard
owns proof, and a skill owns choreography. Seven rules, each selectable with
`--rule=<name>`, and all of them run with no flag. They fail a skill that names
a second home for the plan, carries its own predicate or category table, keeps
a `dod_create` fallback, or runs with no change id. `--root=<dir>` points a rule
at a fixture tree, which is how `check-skill-hygiene.test.mjs` gives every rule
both a passing and a failing fixture. A rule that cannot fail is the failure
mode a text guard invites, so a meta-test asserts every rule has one.

`check-coverage-gate.mjs` runs `dod-guard cover --all` over the whole
`openspec/specs/` tree, not just active changes, so a regression in an
already-archived capability is not invisible. It is the coverage-gate ratchet,
and it runs in `static-analysis` alongside the other four ratchets (see
Ratchets, below) rather than in `plugin-config` - `plugin-config` has no push
permission, and a second job pushing tightened baselines would race
`static-analysis`'s own push non-fast-forward.

The gate builds and bundles `dod-guard` first, because a released binary
cannot see this checkout's own scenarios and markers. That build step lives in
`static-analysis` for the same reason the check itself does.

**The marketplace installs from git, not npm.** The runtime cache contains a checkout of this repo, including tracked `dist/bundle.js`. `static-analysis` owns that bundle. It reflects what CI built from pushed source. The checkout carries skills, agents, hooks, and plugin config alongside it.

### OpenSpec spec layout

Every capability spec lives at `openspec/specs/<group>/<capability>/spec.md`, and the spec id is that path. So `openspec/specs/dod-guard/coverage/spec.md` has the id `dod-guard/coverage`.

Three groups exist. Two match a package name: `dod-guard` (27 specs) and `quality-guard` (7). The third, `openspec-dashboard` (5), names the tool under `tools/openspec-dashboard` instead.

A change's delta directory must mirror the `openspec/specs/<group>/<capability>/spec.md` path exactly, at `openspec/changes/<id>/specs/<group>/<capability>/spec.md`. Get the group wrong and `openspec archive` creates a new flat capability instead of merging into the existing one, silently.

Nesting makes a package prefix in the capability name redundant, so the name drops it. The old `quality-structural-scan` is now `quality-guard/structural-scan`.

**Ratchets** compare against baselines in `.github/quality/`:

| Ratchet | Baseline | Fails when |
|---------|----------|-----------|
| structural quality | `quality-baseline.json` | more violations of a rule in a file than before (`quality-scan.mjs`, all rules except line-length — Biome owns that) |
| test presence | `untested-sources.txt` | a new `src/*.ts` has no `*.test.ts` |
| advisories | `audit-baseline.json` | a new high/critical advisory in production dependencies |
| coverage | `coverage-baseline.json` | a package covers less than it did (`check-coverage.mjs`, statements, branches, functions and lines, 0.25 point slack) |
| coverage-gate (scenarios) | `coverage-gate-baseline.json` | a scenario's `dod-guard cover` outcome regresses to a worse one than the baseline recorded (`check-coverage-gate.mjs`, adopt-unseen, block-on-regression, keyed by scenario id rather than by package) |

Existing debt is allowed; making it worse is not. When a ratchet improves, CI rewrites the baseline in the same commit as the Biome autofixes, so the bar can only rise. To rebaseline by hand: `node scripts/ci/<script>.mjs --write-baseline`.

The quality baseline records **which files it scanned**, not only their counts. A file the baseline has never seen is adopted at its current counts, rather than failing as a jump from zero. The same run writes those counts into the baseline, and the autofix commit picks them up. Otherwise every file created or extracted in a commit would fail the ratchet. The gate failing skips the tighten step, so CI would stay red until someone rebaselined by hand. A file is ratcheted normally from the run after it is adopted.

Adoption is per file, never per rule. A file the baseline already lists was
clean of every rule it holds no row for. So its first violation of one is a
regression from zero. That is what makes a newly added rule bite on existing
files. It also means the commit that adds a rule has to rebaseline in the same
commit. While the gate is red, the tighten step is skipped.

The coverage ratchet measures the compiled output, not the sources. c8 matches
`--include` against the files it loads, which are `packages/<pkg>/dist/**/*.js`.
The report names `src/*.ts` only after it remaps through the source map. An
include written against `src` matches nothing, and c8 enforces no threshold when
nothing matches, so the gate passes at 0 percent while measuring nothing. That is
what the old uniform 90 percent gate did for every package.

Anything that runs a package in a child process has to let it exit on its own. A
killed process never writes its V8 coverage file. `index.characterization.test.ts`
closes stdin and waits, which is why `index.ts` and everything under `src/mcp/`
counts at all.

A package the coverage baseline has never seen is adopted at whatever the run
measured, the same way the quality baseline adopts a new file. The numbers move
with the platform, because a `process.platform` branch only runs on one of them.
So the baseline ships empty and the first CI run fills it in from the runner.

Gate scripts live in `scripts/ci/` and all run locally with no arguments (except `smoke-bundle`, which takes a package name). Run them before pushing a release.

## Key architectural rules

### MCP server guard pattern

Both MCP servers use the same guard so tests can import the server module without starting stdio:

```typescript
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const _filename = fileURLToPath(import.meta.url);

function isMainModule(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(arg) === realpathSync(_filename);
  } catch {
    return arg === _filename;
  }
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (isMainModule()) {
  main().catch((err) => {
    process.stderr.write(`<name> MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
```

### ESM mock.module ordering

`mock.module("node:child_process", ...)` MUST run before the module under test is imported. ESM caching caches the original dependency. Use dynamic `import()` in `before` hooks after `mock.module` registration. The `--experimental-test-module-mocks` flag is required on Node 22. `mock.method()` does NOT work on named ESM exports — use `mock.module` with `namedExports` instead.

### OS awareness (dod-guard)

A `verify_cmd` a `tasks.md` task runs must reference tools available on the
current platform - nothing in `dod-guard cover` validates that for you
before the step runs.

Shell invocation is built by `buildShellInvocation()` in `src/shell.ts` - the
single place that knows how to reach a shell. On Windows it produces
`cmd.exe /d /s /c "<command>"` with `windowsVerbatimArguments: true`. Both
details are load-bearing: cmd.exe has no single-quote grouping (wrapping in
`'...'` makes it look for a program named `'command`), and Node's default
Windows quoting escapes embedded double quotes in a way cmd.exe doesn't
understand, silently mangling `findstr /C:"x" file` and `node -e "..."` into
no-ops that exit 0. Never hand-roll shell escaping elsewhere.

There is no `manual` predicate and no draft-leaf concept. A task with no
`covers` annotation, or one naming an unwired/failed scenario, becomes
`manual_required` with no `verify_cmd` - `/step-by-step` executes it after plan
approval and records it as completed without automated verification. It does not
request another approval. Do not describe the task as verified.

### Biome config note

`ignoreUnknown` in `biome.json` is a boolean (`true`), not `"ignoreUnknowns"`. Biome v2.5.3 changed this from earlier versions.

## Cross-package concerns

- **dod-guard coverage**: `verify_cmd` and `fitness_cmd` take **shell** commands. A task bound to a scenario via a `// covers:` marker uses that scenario's own whole-file test run command, e.g. `node --experimental-test-module-mocks --test packages/dod-guard/dist/cover/run.test.js` - the same command a bound task resolves as its `verify_cmd` (`buildTestRunCommand` in `cover/run-command.ts`). Confirm any scenario's binding and reachability first with `dod-guard cover <change-id>`, exit `0` no regressions / `1` a regression / `3` usage error / `4` an unexpanded task group / `5` a fully expanded plan that names none of the change's scenarios. A regression outranks both plan codes: when a change-scoped run finds one, it exits `1` even when a plan check would also have fired, though both plan checks still run and still write their reports on that path. Between the plan codes themselves, order holds: when nothing regressed, `4` is reported ahead of `5`. There is no MCP tool equivalent - `cover` is shell-only.
- **code-review-graph**: Used for impact analysis during reviews — graph must be built before review tools work

## Documentation

- `packages/dod-guard/README.md`, `packages/dod-guard/USAGE.md` - user-facing plugin docs
- `packages/*/AGENTS.md` - per-package architecture docs (read before working in that package)
