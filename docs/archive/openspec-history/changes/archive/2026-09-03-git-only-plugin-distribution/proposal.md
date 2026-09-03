## Why

The marketplace installs plugins from git, but the binary each plugin runs comes
from npm. `.mcp.json` bridges the two with `npx <package>`. On Windows that costs
three processes per server instead of one: `cmd.exe`, the npx shim's node, and
the server's node. With five plugins enabled that is ten processes doing nothing
but launching, roughly 150 MB per session, repeated for every open session.

The npm half of the split also buys nothing. Nobody installs these packages from
npm. The registry is a delivery hop between this repo and a git checkout of this
repo, and it drags a whole publish pipeline behind it: five publish jobs, release
detection, tarball-contents checks, `files[]` lists, `prepublishOnly` hooks, and
the rule that a version bump landing on master is an irreversible release
instruction.

## What Changes

- **BREAKING** Each package's `dist/bundle.js` becomes tracked in git, and each
  `.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/dist/bundle.js` instead of
  `npx <package>`. One process per server.
- **BREAKING** The five npm publish jobs, `detect-releases.mjs`, and
  `check-pack.mjs` are removed. A version bump on master no longer publishes
  anything. Release becomes: push, wait for CI green, `/plugin update`.
- CI rebuilds all five bundles and commits any drift in the same push that
  already carries Biome autofixes and tightened baselines. The tracked bundle is
  therefore always built from the pushed source by a clean Linux runner.
- `validate-plugins.mjs` swaps its `files[]` reachability rules for git-tracked
  assertions, so a skill, agent, or hook target that stops shipping still fails
  CI. `check-pack.mjs` was the only thing proving that; the proof moves rather
  than disappearing.
- `smoke-bundle.mjs` stays and gains weight: the tracked bundle is now what users
  run, so its MCP handshake is the only thing standing between a bad build and a
  broken session.
- The five published npm packages get deprecated, not unpublished, with a message
  pointing at the git marketplace.

## Capabilities

### New Capabilities

None. See below.

### Modified Capabilities

None. This change alters how the plugins are delivered and how CI proves a
delivery is sound. No package's runtime behavior changes, and no capability spec
under `openspec/specs/` describes the release pipeline: a grep for
`validate-plugins`, `check-pack`, `detect-releases`, `npm publish`, and
`marketplace` across the spec tree returns one incidental mention inside
`dod-guard/blind-rewrite`. The six spec groups are five package names plus
`openspec-dashboard`, and monorepo delivery belongs to none of them. So
`.openspec.yaml` sets `skip_specs: true` rather than inventing a capability to
satisfy validation.

## Impact

- `packages/*/.mcp.json` - all five, invocation shape.
- `packages/*/.gitignore` - all five, `dist/` becomes `dist/*` plus a negation for
  `bundle.js`. A bare `dist/` cannot be undone by a negation, because git does not
  descend into an excluded directory.
- `packages/*/package.json` - all five, `files[]` and `prepublishOnly` removed.
- `.github/workflows/npm-publish.yml` - publish jobs and the `workflow_dispatch`
  package input removed, bundle rebuild added to `static-analysis`. The file is
  renamed to `ci.yml`, since it no longer publishes.
- `scripts/ci/detect-releases.mjs`, `scripts/ci/check-pack.mjs` - deleted.
- `scripts/ci/validate-plugins.mjs` and `scripts/ci/lib/plugin-checks.mjs` -
  `files[]` rules replaced by git-tracked assertions.
- `CLAUDE.md`, `packages/*/CLAUDE.md`, `packages/dod-guard/skills/publish/SKILL.md`,
  `README.md`, `USAGE.md` - the publishing workflow they describe no longer exists.
- npm registry - five packages deprecated. This is the one effect outside the repo
  and it needs an interactive `npm login` first.
