## Why

`git-only-plugin-distribution` moved plugin delivery off npm: each package's
`dist/bundle.js` is tracked in git, and `.mcp.json` runs
`node ${CLAUDE_PLUGIN_ROOT}/dist/bundle.js` instead of `npx <package>`. That
works for `dod-guard` and `quality-guard`. It cannot work for `evomcp`,
`gitevo`, or `obsidian-rag`.

All three depend on `better-sqlite3`, a native module. esbuild cannot bundle a
native module, so all three mark it `external`. Under `npx` npm installed it
alongside the binary. A git checkout has no `node_modules`, so nothing resolves
it, and the server dies before it speaks:

    Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'better-sqlite3'
    imported from ...\cache\dod-guard\gitevo\34e51ca3e3ee\dist\bundle.js

Verified on 2026-08-19 by running each cached bundle directly from
`~/.claude/plugins/cache/`. `dod-guard` and `quality-guard` answer an MCP
`initialize` from the same location; the other three do not.

That breakage is the occasion for this change, not its reason. The reason is
that in roughly six months of deployment the three have been used approximately
never, and their runtime artifacts say so. Measured 2026-08-19:

| Artifact | Size | Last written |
|----------|------|--------------|
| `DeepSeekCustom/.evo/memory.db` | 28 KB | 2026-08-06 |
| `ClaudeSeeker/.evostudio/memory.db` | 20 KB | 2026-07-20 |
| `~/.claude/obsidian-rag/obsidian-rag.db` | 12.9 MB | 2026-07-23 |
| this repo's own `.evo/` | empty, no db | created 2026-07-12 |

The obsidian-rag database is large because something indexed a vault once, then
never wrote again. The gitevo databases are barely past an empty schema. evomcp
left no artifact at all. So the honest ordering is: they were not earning their
place, and the native-dependency break is what forced the question rather than
what answers it. Had they been in daily use, the right response would have been
to fix delivery for them, not to delete them.

They are switched off already: `~/.claude/settings.json` sets
`obsidian-rag@dod-guard`, `evomcp@dod-guard` and `gitevo@dod-guard` to `false`.
This change removes them from the repository, which is the only disable the
repository itself supports.

There is no lighter option. `validate-plugins.mjs` requires every package under
`packages/` to appear in the root marketplace, so dropping a marketplace entry
without dropping the package fails CI. In this repo, disabling is deleting.

## What Changes

- **BREAKING** `packages/evomcp`, `packages/gitevo` and `packages/obsidian-rag`
  are deleted, with their skills, agents, specs and marketplace entries.
- **BREAKING** `/cheap-step` and `/cascade` stop existing. `/ratchet` loses its
  checkpointing and its lesson persistence, and must be rewritten to run without
  them or be retired alongside.
- Six dod-guard skills that name the three get rewritten: `adversarial-workflow`,
  `clean-house`, `interview`, `opsx-explore`, `opsx-propose`, `ratchet`.
- 17 OpenSpec specs are removed: `evomcp` (7), `gitevo` (4), `obsidian-rag` (6).
  Four spec groups remain, of which three match a package name.
- The five npm packages are deprecated, pointing at the git marketplace. This is
  the step `git-only-plugin-distribution` could not take: `npx` was the only
  working path for the three broken plugins, so deprecating would have attacked
  the fallback. Once they are gone, nothing depends on the registry.
- A new CI gate runs each bundle from a directory with no `node_modules`
  ancestor. Nothing in this repo does that today, which is why every gate stayed
  green on a build that cannot start where it installs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None as spec deltas. This change removes capability specs rather than altering
behavior, and the specs it removes belong wholly to the deleted packages. The
one behavioral addition, the standalone-launch gate, belongs to no existing
capability group and would need a new one; the tasks below open that question
rather than presuming the answer. `.openspec.yaml` sets `skip_specs: true`.

## Impact

- `packages/evomcp/` - deleted. 16,441 lines of source, 42 test files, 7 specs.
- `packages/gitevo/` - deleted. 3,102 lines of source, 8 test files, 4 specs.
- `packages/obsidian-rag/` - deleted. 4,455 lines of source, 6 test files, 6 specs.
- `packages/dod-guard/skills/` - six SKILL.md files rewritten. `ratchet` is the
  heavy one: it names ten `evo_*` tools plus `memory_recall` and `memory_save`.
- `packages/dod-guard/skills/cheap-step/` - deleted; it exists only to dispatch
  to evomcp's `solve`.
- `.claude-plugin/marketplace.json` - three entries removed, description reworded.
- `openspec/specs/` - three groups removed.
- `scripts/ci/check-coverage.mjs` and `scripts/dev-mode.mjs` - each holds a
  hardcoded five-package list.
- `.github/quality/` - `quality-baseline.json` (390 matching lines),
  `coverage-gate-baseline.json` (357), `coverage-baseline.json` (3),
  `skip-log.json` (3), `prose-skip-log.json` (2).
- `CLAUDE.md` and `packages/dod-guard/CLAUDE.md` - the package table, the spec
  group list, and the cross-package concerns section all describe five packages.
- `~/.claude/settings.json` - three disabled entries become dead keys. Outside
  the repo and the owner's to clear.
- npm registry - five packages deprecated. The one effect outside the repo, and
  it needs an interactive `npm login`.
