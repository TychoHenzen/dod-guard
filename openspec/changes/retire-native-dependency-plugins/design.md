## Context

See proposal.md - Why.

Three facts from the repo shape everything below.

First, the three packages are not coupled to the two that stay. A grep across
`packages/dod-guard`, `packages/quality-guard` and `scripts/` for the three
names finds no import, only two hardcoded package lists and the marketplace.
The coupling that exists is textual: six dod-guard skills name the tools by
hand in their prose.

Second, `validate-plugins.mjs` asserts that every package under `packages/`
appears in the root marketplace. So there is no state where a package exists but
ships to nobody. Removing the marketplace entry and keeping the directory fails
CI. This is why the owner's "disable them" resolves to deletion.

Third, every gate in this repo runs from inside the repo. `smoke-bundle.mjs`
launches `packages/<pkg>/dist/bundle.js`, where node resolves `node_modules`
upward from the repo root. That is why CI passed a bundle that cannot start
after install. The gate did not fail; it was never pointed at the case.

## Goals / Non-Goals

**Goals:**

- The repository contains only plugins that start from a git checkout.
- Every remaining skill names only tools that exist.
- A gate exists that would have caught this, so the next native dependency
  fails in CI rather than in a user's session.
- The npm packages stop being a delivery path anyone can reach by accident.

**Non-Goals:**

- Porting `better-sqlite3` to `node:sqlite`. Measured on 2026-08-19:
  `node:sqlite` works unflagged on Node 22.15, but reports `no such module:
  fts5`, and `obsidian-rag/src/store.ts` is built on FTS5 with a virtual table,
  three sync triggers, `MATCH` and `snippet()`. It also lacks `.pragma()` and
  `.transaction()`, which both files use. A port is a feature rewrite, and this
  change retires the packages instead.
- Preserving the deleted packages' behavior anywhere else.
- Unpublishing from npm. Deprecation only, for the reasons
  `git-only-plugin-distribution` recorded: unpublish is one-way, the free window
  is 72 hours, and the names lock for 24 hours.
- Recovering the three later. Git history holds them; that is the whole
  preservation plan.

## Decisions

### Delete rather than keep npm alive for three packages

The alternative is a hybrid: `dod-guard` and `quality-guard` ship from git,
the other three keep `npx`. Rejected because it reinstates the whole publish
pipeline this repo just removed, to serve three plugins their owner has
switched off. It also leaves two delivery mechanisms to document and two ways
for a release to be half done.

The cost is real and should be stated plainly: 24,000 lines of source and 56
test files, most of it well covered. `evomcp` measured 95.29 percent statements
and `gitevo` 95.5 percent at the last coverage run. This is not dead code being
swept up. It is working code being retired because its delivery mechanism no
longer exists and its owner does not use it.

### `/ratchet` is the hard part, and it gets decided before anything is deleted

`ratchet` names ten `evo_*` tools, `memory_recall` and `memory_save`. Its
documented loop captures branches with gitevo and persists lessons at the end.
Strip those and what remains is "run the change autonomously until cover
passes", which is close to `/dod-guard:step-by-step` with a loop around it.

So `ratchet` gets a decision, not a patch: rewrite it without checkpointing, or
retire it. Task 1.1 makes that call first, because deleting gitevo before
deciding leaves a skill referencing tools that do not exist, and
`validate-plugins.mjs` only catches that for `subagent_type` references, not for
tool names in prose.

`cheap-step` needs no such decision. It exists to route implementation to
evomcp's `solve`, so it goes with evomcp.

### The standalone-launch gate replaces the assumption that broke

`smoke-bundle.mjs` stays and keeps doing what it does. A second check copies
each bundle to a temporary directory with no `node_modules` above it and runs
the same MCP handshake there. A bundle that needs anything it did not bundle
fails at that point.

Copying to a temp directory rather than launching in place is deliberate: the
plugin cache is not present on a CI runner, and the property under test is "this
file starts with nothing around it", which a temp directory expresses exactly.

Placing it in `package-integrity` keeps it next to the handshake it extends, and
that job has no push permission, so it cannot race `static-analysis`.

### Baselines are regenerated, not hand-edited

`quality-baseline.json` holds 390 lines naming the three packages and
`coverage-gate-baseline.json` holds 357. Editing those by hand invites a
half-removed entry that adopts a file at the wrong counts. Each baseline has a
`--write-baseline` mode; the change runs it and commits the result.

The order matters: delete the packages first, then regenerate, so the baselines
are written from a tree that no longer contains them.

## Risks / Trade-offs

- **A skill can name a deleted tool and no gate notices.** `validate-plugins.mjs`
  resolves `subagent_type` references but not MCP tool names appearing in prose.
  -> Task 3.3 greps every remaining SKILL.md and agent file for `evo_`,
  `memory_recall`, `memory_save`, `solve`, `orchestrate` and the three package
  names, and fails on any hit. Consider promoting that grep to a
  `check-skill-hygiene.mjs` rule, which is where the repo keeps exactly this
  kind of assertion.

- **Deleting 17 specs shrinks the coverage-gate baseline sharply.** A ratchet
  that adopts on unseen and blocks on regression could read wholesale removal as
  improvement and tighten around it. -> Regenerate rather than let it tighten
  incrementally, and check the resulting diff names only the removed scenarios.

- **The owner's `settings.json` keeps three dead keys.** Harmless, but they will
  confuse a later reader into thinking the plugins exist. -> Last task, and it
  is the owner's file, so the change asks rather than edits.

- **npm deprecation is visible immediately and needs `npm login`.** `npm whoami`
  returned 401 on this machine on 2026-08-19. -> Last repo-external task, run
  only after the deletions land and CI is green. Reversible with
  `npm deprecate <pkg>@"*" ""`.

- **Someone wants a retired package back.** -> `git log` and `git show` hold
  every file. The change should record the sha it deleted from, in the commit
  message, so recovery does not need archaeology.

## Migration Plan

1. Decide `/ratchet`'s fate and rewrite or retire it. Nothing is deleted yet.
2. Rewrite the five other dod-guard skills that name the three packages.
3. Delete the three package directories, their specs, and their marketplace
   entries in one commit, so no window exists where the marketplace names a
   package that is gone.
4. Regenerate every baseline from the reduced tree.
5. Add the standalone-launch gate and confirm it fails on a bundle with an
   unbundled dependency, using a deliberately broken fixture rather than trust.
6. Reconcile CLAUDE.md and the package tables.
7. Deprecate on npm, after CI is green.

Rollback: revert the deletion commit. Nothing is unpublished until step 7, and
step 7 is itself reversible.
