# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo overview

npm workspaces monorepo with four MCP server plugins for Claude Code, distributed via git-based marketplace + npm. Each package ships as a single `dist/bundle.js` (esbuild).

| Package | npm name | Purpose |
|---------|----------|---------|
| `dod-guard` | `dod-guard` | Anti-cheat DoD verification with locked proofs. Ships `/interview`, `/quality-upgrade`, `/test-verification`, `/test-fixer`, `/ratchet` skills. |
| `evomcp` | `evomcp` | Cascade solver: cheap-model fanout (best-of-N + repair chains) + scalar-fitness evolution. |
| `gitevo` | `gitevo` | Evolutionary git branching for LLM agents. Checkpoint, spawn, learn, abandon, adopt. |
| `obsidian-rag` | `obsidian-rag` | RAG/memory on Obsidian vaults. Semantic search, note CRUD, memory recall. |

**Each package has its own CLAUDE.md** with detailed architecture, file responsibilities, and domain-specific rules. Read it before working in that package.

## Build, test, lint

All commands from the **monorepo root**:

```bash
# Build all packages (tsc)
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

**Never deploy by manually copying `dist/bundle.js` into `~/.claude/plugins/cache/`.** That creates desync between the published version and what users get.

The correct flow:

1. Bump `version` in the package's `package.json`
2. Commit all changes
3. Tag with format `<package-name>-v<version>` (e.g. `dod-guard-v2.2.7`, `evomcp-v0.1.6`)
4. Push the commit AND the tag: `git push origin master && git push origin <tag>`
5. CI (`npm-publish.yml`) detects the tag at HEAD, runs build+test, then `npm publish`
6. User runs `/plugin update` + `/reload-plugins` to get the new version

**Tag format**: `<package>-v<version>` — CI detects these with `git tag --points-at HEAD | grep -- '-v'`.

**Marketplace**: Update `.claude-plugin/marketplace.json` in each package when adding/removing plugins or skills. The monorepo root `.claude-plugin/marketplace.json` describes all four plugins for the git-based marketplace.

**CI behavior** (`.github/workflows/npm-publish.yml`):
- Push to `master` → build + test always run, plus Biome check + coverage gap detection
- Tag pointing at HEAD → matching publish job fires
- `workflow_dispatch` fallback for manual publishes

### Retriggering CI when tags end up on the wrong commit

Tags on existing commits don't retrigger CI. If you need to move tags to a new commit (e.g., CI fix after tagging):

```
# 1. Delete old tags FIRST
git tag -d <tag1> <tag2> ...
git push origin --delete <tag1> <tag2> ...

# 2. Tag+push commit WITH tags in place (atomically)
git commit --allow-empty -m "chore: retrigger CI with tags"
git tag <tag1> <tag2> ...
git push origin master && git push origin <tag1> <tag2> ...
```

**Never**: commit first, then move tags after. Tags on a pre-existing commit don't retrigger — CI only fires on the push event that introduces both the commit AND the tag.

## Key architectural rules

### MCP server guard pattern

All four MCP servers use the same guard so tests can import the server module without starting stdio:

```typescript
import { fileURLToPath } from "node:url";
const _filename = fileURLToPath(import.meta.url);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === _filename) {
  main().catch((err) => {
    process.stderr.write(`<name> MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
```

### ESM mock.module ordering

`mock.module("node:child_process", ...)` MUST run before the module under test is imported. ESM caching caches the original dependency. Use dynamic `import()` in `before` hooks after `mock.module` registration. The `--experimental-test-module-mocks` flag is required on Node 22. `mock.method()` does NOT work on named ESM exports — use `mock.module` with `namedExports` instead.

### OS awareness (dod-guard)

Proof commands run on the **host OS**. Windows uses `cmd.exe` shell. `dod_create`/`dod_refine`/`dod_amend` validate commands reference tools available on the current platform. Use `isExecutablePredicate()` from checker.ts as the single gate — never inline `pred.type !== "manual"` checks.

### No backwards compatibility shims

This is a private project. Remove old code paths outright — no deprecation warnings, compat layers, or feature flags.

### Biome config note

`ignoreUnknown` in `biome.json` is a boolean (`true`), not `"ignoreUnknowns"`. Biome v2.5.3 changed this from earlier versions.

## Cross-package concerns

- **evomcp → dod-guard**: `verify_cmd` and `fitness_cmd` parameters often use dod-guard commands (e.g. `dod_check --node-path=0.children.1`)
- **gitevo → obsidian-rag**: `evo_export_lessons` outputs memory_save-compatible JSON for persistence
- **obsidian-rag**: Used by the session-start hook for memory injection across all packages
- **code-review-graph**: Used for impact analysis during reviews — graph must be built before review tools work

## Documentation

- `packages/dod-guard/README.md` — user-facing plugin docs
- `packages/dod-guard/docs/` — DoD markdown format spec, predicate reference
- `standards/dod-baselines.md` — company baseline categories (used at dod_create)
- `packages/*/CLAUDE.md` — per-package architecture docs (read before working in that package)
