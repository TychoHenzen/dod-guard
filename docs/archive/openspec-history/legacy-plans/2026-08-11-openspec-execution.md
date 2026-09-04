# Executing the OpenSpec plan in four sessions

Companion to `docs/plans/2026-08-11-openspec-migration.md`. That file holds 41
numbered items. This file groups them into four `/step-by-step` sessions, meant
to run in order.

Each session is one `/step-by-step` invocation. Point the skill at this file
and name the session. That path becomes `plan_source` in `.step-session/`.

## Rules that hold across all four sessions

Read these before the first invocation.

**Do not bump any `package.json` version.** CI publishes any version it finds
missing from npm, and there is no opt-out. Sessions 1 to 4 ship no release.
Do one deliberate bump afterwards, through `/publish`.

**Session 1 has no new machinery.** It runs under today's `/step-by-step`
against a hand-written `steps.json`. Nothing here bootstraps itself.

**Every session runs under the currently deployed plugin.** The `/step-by-step`
executing these sessions comes from `~/.claude/plugins/cache/`, not from this
repo. So a skill edit here changes nothing until a release lands. None of the
four sessions can test its own skill changes.

The same holds for the MCP tools and the CLI. A `dod_*` tool call reaches the
deployed server. A bare `dod-guard` command reaches the deployed binary. New
code from session 2 is reachable only as
`node packages/dod-guard/dist/bundle.js <cmd>`, against the local build.

Use that local path in every `verify_cmd` that needs new behavior. A bare
`dod-guard trace` will fail with an unknown command until release.

**Skill and agent edits need `node scripts/ci/validate-plugins.mjs`.** It is
the gate that catches an unshipped file or a broken reference. Every session
that touches `skills/` or `agents/` ends on it.

**Every session ends with a commit and no push.** Review the diff, then push
when you are satisfied.

**Check the `openspec` verify commands before trusting them.** I wrote them
from the docs without running the CLI. Session 1 installs it, so confirm each
one there. A verify command that does not exist stalls a step.

## Session 1: adopt OpenSpec and fix the global setup

Covers items 1 to 6 and 37 to 41. Eleven steps.

Two unrelated halves, grouped because neither writes code. The first half
installs the tool. The second half is `~/.claude` prose.

| Step | Item | Verify |
|------|------|--------|
| Install the CLI, run `openspec init` | 1 | `openspec validate --strict` |
| Commit `openspec/`, no ignore entry | 2 | `git ls-files openspec \| head -1` |
| Set the extended profile, run update | 3 | `openspec config profile --json` |
| Trim the generated AGENTS.md | 4 | manual |
| Add the validate gate to CI | 5 | `grep -c "openspec validate" .github/workflows/npm-publish.yml` |
| Propose this plan as the first change | 6 | `openspec status --json` |
| Add the plan-mode rule | 37 | `grep -c "plan mode" ~/.claude/CLAUDE.md` |
| Add the assumptions preamble | 38 | `grep -c "assumptions" ~/.claude/CLAUDE.md` |
| Add the two-correction rule | 39 | `grep -c "two-correction" ~/.claude/CLAUDE.md` |
| Cut loaded prose toward 200 lines | 40 | `wc -l` across the four files |
| Count AGENTS.md against that budget | 41 | manual |

Step 4 and step 11 are `manual_required`. Judging whether prose duplicates
other prose needs your eyes.

Steps 7 to 11 write outside the repo, into `~/.claude`. They are still safe.
That path is not under `.claude/plugins/`, so the read-only rule does not
apply.

Exit gate: `openspec validate --strict` exits 0, and the four config files
total under 250 lines.

## Session 2: build the seam

Covers items 7 to 15. Nine steps. This is the real engineering.

Run it only after session 1. Every step needs a working `openspec` CLI.

| Step | Item | Verify |
|------|------|--------|
| Fork the schema, add a `dod` artifact | 7 | `openspec schema validate <name>` |
| Write the DoD template | 8 | `openspec templates --json` |
| Add `dod` to `applyRequires` | 9 | `openspec status --json` shows it blocking |
| Write the converter | 10 | new unit test in `packages/dod-guard` |
| Map scenario to leaf | 11 | test: one scenario in, one leaf out |
| Map an uncheckable scenario to a draft | 12 | test: draft leaf, `MANUAL:` intent |
| Register through `dod_import` | 13 | test: import reports the right leaf count |
| Settle the fingerprint question | 14 | test: regenerate, then re-check |
| Add `dod-guard trace` | 15 | test: untraced leaf exits non-zero |

Item 14 is the risk. If `dod_amend` does not cover a regenerated DoD, this
step grows. Let it stop the session rather than weakening the fingerprint.

Every step here writes a test first. The steps are behavior, so dispatch them
to `dod-guard:step-tdd-implementer`.

Exit gate: `npm test -w packages/dod-guard` passes, and `dod-guard trace` runs
against the change that session 1 proposed.

## Session 3: rebuild /step-by-step

Covers items 21 to 31. Eleven steps.

Nothing here becomes live during the session. The rewritten skill sits in the
repo, unused, until the release in session 5.

| Step | Item | Verify |
|------|------|--------|
| Make `steps.json` a schema artifact | 21 | `openspec schema validate <name>` |
| Convert DoD leaves to steps | 22 | unit test on the converter |
| Map `MANUAL:` to `manual_required` | 23 | unit test |
| Add the `Requirement` briefing field | 24 | `grep -c "Requirement:" SKILL.md` |
| Add the assumption rule to briefings | 25 | `grep -c "ASSUMPTION" SKILL.md` |
| Rework the staleness check | 26 | `grep -c "openspec status" SKILL.md` |
| Add OpenSpec to the callers list | 27 | `grep -c "opsx" SKILL.md` |
| Commit after each verified step | 28 | `grep` SKILL.md and all five `step-*` agents |
| Extend Finishing with archive | 29 | `grep -c "openspec archive" SKILL.md` |
| Mirror all of it into `/cheap-step` | 30 | diff the two SKILL.md files |
| Feed the spec to adversarial reviewers | 31 | `grep` the six `adversarial-*` agents |

A `grep -c` verify only proves text landed. It does not prove the skill
behaves. Nothing in sessions 1 to 4 can prove that, because the rewritten
skill is never the one running. Accept the weaker check here and pay for it in
session 5.

Exit gate: `node scripts/ci/validate-plugins.mjs` passes and `npm test` passes
at the root.

## Session 4: /interview and the assumption audit

Covers items 16 to 20 and 32 to 36. Ten steps.

This runs under the deployed `/step-by-step`, the same as the other three. It
is not a test of session 3.

| Step | Item | Verify |
|------|------|--------|
| Rewrite `/interview` Phase 4 | 16 | `grep -c "opsx:propose" SKILL.md` |
| Keep floors and adversarial review | 17 | `grep` the question floors survive |
| Split confirmed from unconfirmed | 18 | `grep -c "open_questions" SKILL.md` |
| Add risk labels, cap at 3 questions | 19 | `grep -c "Low, Medium" SKILL.md` |
| Name `/opsx:apply` in the handoff | 20 | `grep -c "opsx:apply" SKILL.md` |
| Settle the `todo-marker` collision | 32 | scanner test on an `ASSUMPTION:` line |
| Add the `assumption-marker` rule | 33 | scanner unit test |
| Write the convention into CLAUDE.md | 34 | `grep -c "ASSUMPTION" ~/.claude/CLAUDE.md` |
| Build the audit | 35 | the audit runs and reports on this repo |
| Decide where the audit runs | 36 | manual |

Item 33 rewrites `.github/quality/quality-baseline.json`. A new rule counts as
a regression from zero on every file the baseline already lists. So rebaseline
in the same commit, or CI stays red.

Exit gate: `npm test` passes at the root, and
`node scripts/ci/validate-plugins.mjs` passes.

## Session 5: release, then actually test it

Not a `/step-by-step` session. This is the release, and it is the first moment
any of the skill work becomes real.

1. Bump the `dod-guard` and `quality-guard` versions. Run `/publish`.
2. Wait for CI. Every gate has to pass before either package publishes.
3. Run `/plugin update`, then `/reload-plugins`.
4. Confirm the new version is live. `dod-guard trace` should now answer as a
   bare command, without the `dist/bundle.js` path.
5. Now run the acceptance test. Drive one real change end to end:
   `/interview`, then `/step-by-step`, then archive.
6. Use a small, real piece of work. Item 36, deciding where the assumption
   audit runs, is a good candidate.

Treat step 5 as the gate for the whole plan. Everything before it is
unverified where skills are concerned.

## The four invocations

Run these in order. Do not start one before the previous exit gate is green.

```
/dod-guard:step-by-step docs/plans/2026-08-11-openspec-execution.md - run Session 1 only, items 1-6 and 37-41. Do not bump any package.json version.

/dod-guard:step-by-step docs/plans/2026-08-11-openspec-execution.md - run Session 2 only, items 7-15. Test-first on every step. Stop the session if item 14 cannot be settled without weakening the fingerprint.

/dod-guard:step-by-step docs/plans/2026-08-11-openspec-execution.md - run Session 3 only, items 21-31. Skill edits go to the repo and stay dormant. Do not expect any behavior change during this session.

/dod-guard:step-by-step docs/plans/2026-08-11-openspec-execution.md - run Session 4 only, items 16-20 and 32-36. Rebaseline .github/quality/quality-baseline.json in the same commit as item 33.
```

Session 5 is not one of these. Run it by hand, through `/publish`.

## What could go wrong

- Session 2 item 14 is the one unknown. It could turn out to need a change to
  the fingerprint itself, which is a design decision, not a step.
- Sessions 3 and 4 ship unverified skill rewrites. Running under the deployed
  plugin means no session can exercise its own changes. That risk is real and
  it lands all at once, in session 5.
- The custom schema in items 7 and 21 rests on documentation I have not run.
  Session 1 is the first chance to check it. If `schema.yaml` does not take a
  user-defined artifact, sessions 2 and 3 both need reworking.
- A skill rewrite can lose behavior nobody wrote down. `/step-by-step` is the
  primary build tool, so a regression there costs more than it saves.
