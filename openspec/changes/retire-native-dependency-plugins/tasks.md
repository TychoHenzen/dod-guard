## 1. Decide what survives before deleting anything

- [x] 1.1 Decide `/dod-guard:ratchet`'s fate. It names ten `evo_*` tools plus `memory_recall` and `memory_save`, and its documented loop captures branches with gitevo and persists lessons at the end. Either rewrite it to run without checkpointing, or retire it with the packages. Record the decision in this change's design.md before task 3.1 deletes anything. Do not start by editing the file.
<!-- status: completed -->
- [x] 1.2 Delete `packages/dod-guard/skills/cheap-step/`. It exists only to route each step's implementation to evomcp's `solve` tool, so it has no meaning without evomcp. Remove its marketplace and description mentions in the same commit, then confirm with `node scripts/ci/validate-plugins.mjs`, which fails on a `/slug` in a description naming a skill that does not ship.
<!-- status: completed -->

## 2. Rewrite the skills that name the three packages

- [x] 2.1 Rewrite `packages/dod-guard/skills/ratchet/SKILL.md` per the 1.1 decision, or delete it. If rewritten, it must name no `evo_*` tool, no `memory_*` tool, and neither `gitevo` nor `obsidian-rag`.
<!-- status: completed -->
- [x] 2.2 Rewrite the five remaining skills that name the three: `adversarial-workflow` (uses `evo_learn`, `memory_save`), `clean-house` (uses `evo_learn`), `interview`, `opsx-explore`, and `opsx-propose`. Each keeps its own job; only the handoffs to deleted tools go.
<!-- status: completed -->
- [x] 2.3 Run `node scripts/ci/check-skill-hygiene.mjs` and `node --test scripts/ci/check-skill-hygiene.test.mjs`. Both must exit 0. A rewritten skill can trip the rule that fails a skill naming a second home for the plan.
<!-- status: completed -->

## 3. Delete the three packages

- [x] 3.1 Delete `packages/evomcp/`, `packages/gitevo/`, `packages/obsidian-rag/`, their three entries in `.claude-plugin/marketplace.json`, and the marketplace description text naming them. Do all of it in one commit, so no state exists where the marketplace names a package that is gone. Record the deleted-from sha in the commit message, since git history is the whole recovery plan.
<!-- status: completed -->
- [x] 3.2 Delete `openspec/specs/evomcp/`, `openspec/specs/gitevo/`, and `openspec/specs/obsidian-rag/` (7, 4 and 6 specs). Run `openspec validate --all --strict --no-interactive`; it must pass with four spec groups remaining.
<!-- status: completed -->
- [x] 3.3 Grep every remaining `SKILL.md` and agent file for `evo_`, `memory_recall`, `memory_save`, `solve`, `orchestrate`, `evomcp`, `gitevo` and `obsidian-rag`. Any hit is a skill naming a tool that no longer exists. `validate-plugins.mjs` resolves `subagent_type` references but not tool names in prose, so nothing catches this today. Consider promoting the grep to a `check-skill-hygiene.mjs` rule with a passing and failing fixture, which is where this repo keeps assertions of exactly this shape.
<!-- status: completed -->
- [x] 3.4 Remove the three from the hardcoded package lists in `scripts/ci/check-coverage.mjs` (line 29) and `scripts/dev-mode.mjs` (line 11). Grep for other five-element package lists; these two were found by search, not by an exhaustive audit.
<!-- status: completed -->
- [x] 3.5 Run `npm install` at the root so `package-lock.json` drops the three workspaces. `npm ci` refuses a lock file that disagrees with the workspace list, and CI dies at its first step. Commit the updated lock file.
<!-- status: completed -->

## 4. Regenerate the baselines

- [x] 4.1 Regenerate every baseline from the reduced tree, in this order and only after task 3 lands: the quality baseline (390 lines name the three), `check-coverage.mjs --write-baseline` (3 lines), `check-coverage-gate.mjs --write-baseline` (357 lines). Do not hand-edit any of them; a half-removed entry adopts a file at the wrong counts.
<!-- status: completed -->
- [x] 4.2 Check `.github/quality/skip-log.json` (3 matches) and `prose-skip-log.json` (2 matches) for entries under the deleted paths and clear them.
<!-- status: completed -->
- [x] 4.3 Read the resulting baseline diff and confirm it removes only the deleted packages' rows. A wholesale removal can read as improvement to a ratchet that adopts on unseen and blocks on regression, so the diff is the check, not the exit code.
<!-- status: completed -->

## 5. Add the gate that would have caught this

- [x] 5.1 Add a check that copies each package's `dist/bundle.js` to a temporary directory with no `node_modules` ancestor and runs the same MCP initialize handshake `smoke-bundle.mjs` runs. A bundle needing anything it did not bundle must fail. Copying rather than launching in place is deliberate: the property under test is "this file starts with nothing around it", and a CI runner has no plugin cache.
<!-- status: completed -->
- [x] 5.2 Prove the gate is not vacuous. Build a fixture bundle that imports a package it does not bundle, and confirm the check fails on it and passes on a real one. A gate that cannot fail is the failure mode this repo already guards against, and it is exactly what went wrong here: `smoke-bundle.mjs` runs inside the repo, where `node_modules` resolves upward, so it could never have caught an unbundled dependency.
<!-- status: completed -->
- [x] 5.3 Wire it into the `package-integrity` job in `.github/workflows/ci.yml`, next to `Bundle MCP handshake`. That job has no push permission, so it cannot race `static-analysis`.
<!-- status: completed -->

## 6. Reconcile the documentation

- [x] 6.1 Update the root `CLAUDE.md`: the five-row package table, the "Monorepo overview" sentence counting five plugins, the spec-group list (six groups, five matching package names), and the "Cross-package concerns" section, which describes evomcp to dod-guard, gitevo to obsidian-rag, and evomcp to gitevo relationships that will not exist.
<!-- status: completed -->
- [x] 6.2 Update `packages/dod-guard/CLAUDE.md`'s skills table for whatever tasks 1.2 and 2.1 removed.
<!-- status: completed -->
- [x] 6.3 Run `node scripts/ci/validate-plugins.mjs`, `node scripts/ci/check-skill-hygiene.mjs`, `openspec validate --all --strict --no-interactive`, and `npm test` at the root. All four must pass.
<!-- status: completed -->

## 7. Retire the npm packages

- [x] 7.1 Push and confirm CI is green before anything leaves the machine. `git-only-plugin-distribution` proved this order matters: its own section 5 was blocked because npm was still the only working path for the three plugins this change deletes.
<!-- status: completed -->
- [x] 7.2 Ask the user to run `npm login`. `npm whoami` returned 401 on this machine on 2026-08-19 and login is interactive.
<!-- status: completed -->
- [x] 7.3 Run `npm deprecate <pkg>@"*" "Moved to the git marketplace at github.com/TychoHenzen/dod-guard - install with /plugin marketplace add, not npm."` for `dod-guard`, `quality-guard`, `evomcp`, `gitevo` and `obsidian-rag`. Verify each with `npm view <pkg> deprecated`. Deprecate, never unpublish: unpublish is one-way, the free window is 72 hours, and the names lock for 24 hours.
<!-- status: completed -->
- [x] 7.4 Tell the user that `~/.claude/settings.json` lines 161 to 163 hold now-dead keys for `obsidian-rag@dod-guard`, `evomcp@dod-guard` and `gitevo@dod-guard`. That file is outside the repo and theirs to clear.
<!-- status: completed -->
