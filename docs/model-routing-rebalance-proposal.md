# Model routing rebalance: sonnet by default, haiku implements, opus only by escalation

Status: design record for TychoHenzen/dod-guard#944, 2026-10-15; decision N1
(rename the agents) made the same day. It was drafted before the work and is
delivered by the pull request for #944, which releases dod-guard 5.7.0 (a minor:
the skills' commands are unchanged, the agent names are internal to the skills).
The local overlay stays until that release is installed. It changes `standards/model-routing.md`,
the tier agents, the `goal-sdlc` delegation table, and a few skills; it also
retires the local `goal-sdlc-next` overlay.

## Summary

- Today every stage owner is an opus `stage-strong` worker, and haiku only
  reads and validates. In the plain-skill run (no overlay) 88% of spend was opus.
- Proposed: three tiers. `standard` (sonnet) is the default for every
  judgement stage and every stage owner. `cheap` (haiku) implements a task from
  a written plan, validates, investigates, and captures backlog items.
  `strong` (opus) is never a first assignment: a stage reaches it only after a
  lower tier failed its check twice.
- The overlay `goal-sdlc-next` waited for #831, #832 and #833. All three closed
  on 2026-10-08 and 2026-10-09, so its own deletion condition has held for a
  week. What it still carries is listed under "Overlay disposition".
- Estimated saving on goal-sdlc spend: 23% (conservative, from the one measured
  haiku cost ratio) to 31% (optimistic) from routing, plus about 4% if the
  loop's own session runs on sonnet. See "Evidence" for the method and limits.

## Assumptions

- ASSUMPTION (Low): the deliverable is this document only. No skill, agent,
  test, or generated file was edited.
- ASSUMPTION (Medium): "sonnet for almost everything routed to opus" covers the
  owners of every stage, the review planner and the four lens judges, refinement
  decisions, draft PR, remediation, completion, and conflict triage.
- ASSUMPTION (Medium): haiku implements from a plan the owner writes first.
  Haiku is not asked to design. A task the owner cannot reduce to a written
  plan runs at the standard tier.
- ASSUMPTION (Medium): "drops effort max on haiku" means Claude Code. The repo's
  Claude side already has `effort: medium` in every haiku agent; the remaining
  `max` sources are the overlay (every cheap row) and `codex_effort: max` for
  Codex `gpt-5.6-luna`. This proposal removes the overlay and leaves the Codex
  value alone because nothing here measures Codex.
- DECIDED 2026-10-15 (N1): the opus-default agents are renamed rather than keep
  a name that now lies. See "Agents and naming".
- ASSUMPTION (Low): the Codex standard tier is `gpt-5.6-terra`, because
  `convert-claude-agents.mjs` already maps `sonnet` to it.

## Evidence

Method: the subagent transcripts of this machine, one `.jsonl` plus
`.meta.json` per subagent, joined to the parent's Agent `tool_use` input for
the requested model and effort. Cost is a proxy: haiku 1, sonnet 3, opus 5 per
input token, cache write 1.25x, cache read 0.1x, output 5x. These are
4.5-generation price ratios; Claude 5.5 prices were not checked. Window:
2026-10-08 to 2026-10-15, four goal-sdlc runs in one project (1800 units).

| Stage | Share of spend | Model that ran |
|---|---|---|
| Implement one task | 24.4% | opus 16.1%, haiku 8.3% |
| Review owner stage | 10.5% | opus |
| Review investigate | 11.3% | haiku |
| Fix review findings | 8.1% | opus 4.7%, haiku 3.4% |
| Refine decide | 5.6% | opus |
| Draft PR | 5.2% | opus |
| Draft, review and fix as one agent | 4.9% | opus |
| Complete and merge | 3.3% | opus |
| Review judge (4 lenses) | 3.0% | opus 2.8%, sonnet 0.2% |
| Implement plan | 1.8% | opus |
| Review plan | 1.7% | opus |
| Other (backlog and friction log, refinement research, unlabeled workers) | 7.0% | mixed |
| Main thread (the loop session) | 12.5% | opus 9.1%, sonnet 3.4% |

The rows add to 99.3%; the rest is rounding and a few sonnet rows under 0.2%.
Totals: opus 71%, haiku 25%, sonnet 4%.

Plain goal-sdlc 5.6.1 (the 10-14 to 10-15 run, no overlay): 88% opus, 9% sonnet
(main thread), 3% haiku. The main thread dispatched only `stage-strong` at
opus/medium, one per stage.

Estimated effect of this proposal on the opus-routed rows (1105 units):

| Assumption about haiku implementation | Saving, share of 1800 |
|---|---|
| Same tokens as opus today, priced as haiku | 31% |
| Haiku burns 2x the tokens | 28% |
| Haiku burns 3x the tokens | 25% |
| Measured: haiku implementers averaged 3.4 units per agent against 4.8 for opus owners, 0.71x | 23% |

The measured row is the conservative figure. It comes from 62 haiku agents at
effort `max` (average 181k output tokens each) against 140 opus owners on
different tasks, so it is a rough ratio. Medium effort should do better, but
that is unmeasured for implementation. Sonnet rows are priced at the same
tokens as opus today and may need more iterations, so every row is an upper
bound on its own assumptions. The loop session on sonnet is a separate saving
of about 4%.

The analysis ran against installed 5.6.1. The source repo's `master` is ahead of
that copy in `skills/review-pr/SKILL.md` (a scanner merge pass after the
judges) and `USAGE.md`, so this draft cites sections, and line numbers only for
files that are identical in both.

What the evidence does not show: any quality difference. The 10-08 to 10-11 run
used 62 haiku agents for implementation, remediation, and friction-log writes,
so haiku implementation has been tried, but review findings per PR were not
compared. The pilot below measures that.

## Design

### Tiers

| Tier | Claude Code | Codex | Role |
|---|---|---|---|
| cheap | `haiku`, effort `medium` | `gpt-5.6-luna`, `codex_effort` (unchanged, `max`) | Mechanical, high-volume work with the decisions already made: implementing one task from a written plan, validations, regeneration, applying a plan, reading files to answer planned questions, backlog capture. |
| standard | `sonnet`, effort `medium` | `gpt-5.6-terra`, effort `medium` | Default. Judgement with modest reasoning effort: planning, deciding scope and acceptance, judging evidence, owning a stage, drafting a pull request, remediation, the guarded merge. |
| strong | `opus`, effort `high` | `gpt-5.6-sol`, effort `high` | Escalation only. A stage a lower tier could not complete. |

The standard and cheap rows come from the tier agents' frontmatter, as today.
The strong row has no agent; its values live in the tier table of
`standards/model-routing.md` and are passed on the Agent call. The `strong`
effort of `high` is a proposal (open question 1).

### Stage routing

This replaces the `goal-sdlc` Delegation table. Row names that exist today are
kept so the diff reads as tier changes plus two new rows.

| Stage | Today | Proposed |
|---|---|---|
| Queue snapshot read | cheap | cheap |
| Refinement: plan research questions | strong | standard |
| Refinement: investigate code, callers, and tests | cheap | cheap |
| Refinement: decide classification and criteria | strong | standard |
| `/next-ticket`: owner (branch, matrix, preflight, handoff) | strong | standard |
| `/next-ticket`: write the step plan for one task (new row) | not routed | standard, by the owner itself |
| `/next-ticket`: implement one task from its plan | strong | cheap |
| `/next-ticket`: run validations and regenerate artifacts | cheap | cheap |
| `/submit-draft-pr` | strong | standard |
| `/review-pr`: plan | strong | standard |
| `/review-pr`: investigate | cheap | cheap |
| `/review-pr`: judge | strong | standard |
| `/review-pr`: merge pass (on source `master`, not in 5.6.1; named in `review-pr`, not in the goal-sdlc table) | strong | standard |
| `/fix-pr-review`: owner (revalidate, plan, verify, reply) | strong | standard |
| `/fix-pr-review`: apply a written per-finding fix (new row) | not routed | cheap |
| `/complete-pr`: guarded merge and Project finalization | strong | standard |
| `/add-backlog-idea`, including the friction log | strong | cheap, on the all-tools worker |
| Merge conflict plan and judge | strong | standard |
| Merge conflict apply | cheap | cheap |
| Escalation (any row) | not defined | strong, see below |

`/add-backlog-idea` writes GitHub state, so it needs the all-tools worker. The
existing rule already runs a cheap skill-capable stage on that worker at the
cheap tier's model and effort, so no new mechanism is needed.

The loop's own session is not routed by the skill. Add one sentence to
`USAGE.md`: run the `/goal` session on sonnet, because the loop only sequences
stages and checks results. The plugin cannot enforce this.

### Implementation on haiku: the plan contract

Haiku follows plans; it does not design. The `stage-cheap` contract already says
"follow the plan as written" and "stop and report the exact gap". To make
implementation fit that contract:

1. The `/next-ticket` owner (standard) writes a step plan per task to a
   scratch file outside the repository: for each step the file, the edit
   (symbol and intent), the test to add or change (name and the assertion),
   the validation command, and the expected result. Use fenced code blocks
   only: earlier runs showed a haiku worker stopping on a 4-space-indented code
   block in a plan. Keep each batch small; earlier cheap rows took 13 to 15
   minutes per small batch. When the plan needs a large read volume, the
   existing plan, investigate, judge split applies.
2. The owner dispatches `dod-guard:stage-cheap` at haiku with the plan path
   and the files it may edit. The worker edits, runs every named validation in
   the foreground, and returns the evidence. It never commits or pushes.
3. The owner verifies as `standards/model-routing.md` already requires: each
   change maps to a plan step, cited paths exist, and at least one named proof
   passes when the owner reruns it. The owner then commits and pushes with the
   trailer line from the main session's attribution reminder, verbatim
   (`step-by-step` keeps the per-step commit). The owner may apply a small
   exact edit itself instead of dispatching it.
4. A task the owner cannot reduce to a written plan, because the right design
   is not yet known, is implemented by the owner's own thread at the standard
   tier instead of being sent to haiku.

### Escalation

Opus is a recovery path, not a tier a stage starts on.

Ladder: cheap, then standard, then strong. A stage climbs one rung at a time.

Triggers, each only after the stage's normal repair has been tried:

- A step's output fails the main thread's verification, is sent back once with
  the exact gap at the same tier (existing rule), and fails again.
- A worker reports that the plan cannot be applied, or that the stage needs a
  decision it was not given, and the owner cannot close the gap by correcting
  the plan.
- A standard-tier stage ends with a named proof still failing after its one
  repair.

Not triggers: a security, authority, provider, head-mismatch, or missing
evidence stop. Those stop as `standards/working-defaults.md` says; a stronger
model does not fix them.

Order inside a stalled stage:

1. Same tier, one send-back with the exact gap (existing). A `step-by-step`
   step already has it: its one fresh bounded repair task.
2. Before the strong rung only, `/codex-advisor`: one read-only turn, as
   `working-defaults.md` already requires for a confirmed blocker. If its advice
   names a repair, apply it at the standard tier. The cheap-to-standard rung and
   the rerun of a read-only review batch skip this step (review finding on the
   advisor order).
3. Re-dispatch the stage one rung up with the failure record: the attempts,
   errors, files touched, and the advisor's advice when step 2 ran. The new run
   verifies by the same rules; verification applies by model tier.
4. A failure at the strong rung stops the parent as a blocker under the
   existing Blockers rule.

Each stage climbs a given rung at most once. Every escalation is named in the
progress message (stage, from tier, to tier, trigger) and appended to that
day's friction log as an occurrence. The log is the tuning input: a row that
escalates often belongs one tier higher in the table.

A user-named model or effort still wins over the tier for that run.

Who carries out an escalated stage. The escalating thread never changes its
own model.

- Cheap to standard on an implementation task: the owner, already a standard
  thread holding the plan and the failure record, implements the task itself.
  That avoids a cold-start dispatch.
- Standard to strong, on any stage: the thread that dispatched the stage (the
  owner for a row, the loop session for an owner stage) re-dispatches it on
  `stage-standard` with `model: opus` and the failure record in the brief.

Existing stop-on-second-failure rules. The ladder does not replace all of
them, and the change must say which it replaces:

| Rule today | Where | Proposed |
|---|---|---|
| A failed check is sent back once, a second failure stops the stage | `model-routing.md` "Verify cheap-tier output" | escalate, then stop (this section) |
| A step gets one fresh bounded repair, then stops with the checkpoint | `step-by-step` "Failures and repair", used for every `next-ticket` task | escalate, then stop: the repair is the same-tier send-back, and a step routed by tier climbs one tier before it stops (review finding GH-4286212964) |
| A failed investigator batch is sent back once, then stop without posting | `review-pr` section 5, Verify | escalate the batch to standard once, then stop. A review is posted once per PR, so a missed angle cannot be filled in later |
| A judge returns malformed JSON twice, stop without posting | `review-pr` section 5, Judge | stays stop. A format failure is not a capability failure |
| The merge pass output is refused twice, stop without posting | `review-pr` section 5, merge pass | stays stop, same reason |
| Conflict triage verification fails a second time | `conflict-triage.md` "Stages" and "Stop rules" | stays stop. It guards git state and push provenance, which a stronger model does not repair |

Verifying standard-tier output. Today the cheap tier's output gets the full
check (answers map to questions, cited lines exist, one proof rerun, readback
of written state) and the strong tier gets only a commit readback. With sonnet
doing the strong tier's work, the proposal is:

- Cheap-tier output: unchanged, the full check.
- Standard-tier output: the commit readback (the commit exists, is pushed, and
  matches the described diff), the stage's own named proof, and a readback of
  any issue, pull request, or Project state it wrote. It does not need the
  per-answer check, because a standard worker returns judgements, not
  citations.
- Escalated strong-tier output: the same as standard.

"Verification applies by model tier" then has a rule behind each of the three
tiers.

### Agents and naming

Capability and tier are separate axes. The capability agents are the all-tools
worker, the edit-only worker, and the read-only worker. The tier is a model and
effort passed on the Agent call, which the standard already says overrides the
frontmatter.

Decision N1 (decided 2026-10-15): rename the opus-default agents to match the
new default, so no agent is called "strong" while running sonnet.

| Today | Proposed | Model |
|---|---|---|
| `stage-strong` | `stage-standard` | sonnet |
| `read-strong` | `read-standard` | sonnet |
| `review-pr-feature`, `-design`, `-reliability`, `-hygiene` | same names | sonnet |
| `stage-cheap`, `read-cheap` | unchanged | haiku |
| strong | no agent | `model: opus` on the Agent call |

Escalation dispatches the same agent with `model: opus` and the strong effort,
exactly as a cheap skill-capable stage dispatches the all-tools worker with
`model: haiku` today.

Rejected N2: keep the names and flip the frontmatter models. It was the
smaller diff, but every progress message would have read "stage-strong,
sonnet".

Blast radius of N1: the agent file names, the generated
`.codex/agents/dod_guard_*.toml` files, `review-pr` (it names the registered
`dod_guard_read_strong` agent), and about a dozen phrases that tests pin. A
grep of the plugin manifests, the marketplace file, and `scripts/` found no
manifest or CI script that lists these agent names; `plugin-checks.mjs` only
lists built-in agent names. I found no `.codex/agents` copy in the cardcleaner
repo; other downstream registrations were not searched.

Rename mechanics, for the delivery PR:

1. `git mv` both agent files, so history follows, and edit the title,
   description, and `model: sonnet` in the same commit. Keep the tools lines.
2. Regenerate `.codex/agents` with the declared generator and `--check`, and
   delete `dod_guard_stage_strong.toml` and `dod_guard_read_strong.toml`.
3. Update every skill, standard, test, and `USAGE.md` mention of the old names
   in the same PR. One sweep is enough: grep `stage-strong`, `read-strong`,
   `stage_strong`, `read_strong`, and `Strong-tier` over the repo, excluding
   `docs/archive`.
4. Claude Code agents have no alias mechanism, so a brief that still says
   `dod-guard:stage-strong` fails after the update. The rename is breaking for
   any caller that names the old agents; do not ship it as a patch release.
   Choose the version at `/publish`.
5. After the release, refresh local notes that name the old agents (the
   agent-tool-gaps memory note says "run it on `dod-guard:stage-strong`").
   Sessions started before the update keep the old names until they reload.

### Effort

- Claude: every haiku and sonnet agent keeps `effort: medium` in its
  frontmatter, and the table in the standard stops being the place anyone types
  `max`. Add a test that no Claude-side tier agent has `effort: max`.
- Haiku at `max` coincided with about 4.7 times the output per call on
  investigators (7.6k against 1.6k tokens). That compared different batches, so
  it is a likely cause, not a proven one.
- Codex: `codex_effort: max` on the cheap agents stays. Open question 2.

### Codex

The converter already maps `sonnet` to `gpt-5.6-terra`. Regenerating
`.codex/agents` gives `dod_guard_stage_standard.toml` and
`dod_guard_read_standard.toml` pinned to terra. Strong in Codex has no
registered agent, so an escalation spawns the standard agent's definition with
`gpt-5.6-sol` at spawn time and records it as "requested, not pinned", which is
the rule the standard already uses for a cheap skill-capable stage.

## Overlay disposition

`~/.claude/skills/goal-sdlc-next/SKILL.md` is a user-global skill, not an
installed plugin, so removing it is allowed. Do it last (see "Rollout"): until
the new routing is published and updated, the overlay's haiku implementation
row is the only thing that keeps implementation off opus.

| Overlay content | In dod-guard 5.6.1? | Disposition |
|---|---|---|
| Resume before selecting | yes, goal-sdlc loop step 1 | drop |
| Delete merged local and remote branches at run start | `/complete-pr` already cleans the branch it merges | drop; one-time cleanup by hand for old branches |
| Read the Clean Code chapter of the knowledge base | no | move to the project's `CLAUDE.md` if wanted; it depends on a knowledge-base server that is down today |
| Quality Guard metrics are diagnostic | yes, root `AGENTS.md` | drop |
| Model routing table | superseded | replaced by the table above |
| Pass `model` and `effort` explicitly | yes, model-routing "Applying a tier" | drop |
| Plan, investigate, judge; scratch file handoff | yes, review-pr, refinement, conflict triage | drop |
| Per-lens questions in a collapsed block | yes, review-pr "collapsed `<details>` block" | drop |
| Verify cheap output, rerun one named proof | yes, model-routing | drop |
| Commit trailer names the main-thread model; put the exact `Co-Authored-By` line in every brief that commits | partly: the dispatching thread commits with its own trailer | port one sentence to model-routing "commit ownership" |
| Foreground validations, resume a worker that returns "waiting" | yes, stage agents and goal-sdlc Delegation | drop |
| Merge `origin/master`, never rebase or force-push | yes, working-defaults and conflict-triage | drop |
| Never post a second `@codex review` on a pull request | no | project habit, not workflow: move to the project's `CLAUDE.md` |
| Built-in advisor in Claude Code | yes, working-defaults | drop |
| Final report counts parents and children Done | yes, goal-sdlc Reporting | drop |
| Friction log through a cheap-tier subagent | table says strong | covered by the new `/add-backlog-idea` row |
| `/publish` is not run automatically | goal-sdlc never calls it | drop |

Net port into dod-guard: one sentence (trailer line in briefs). Two items move
to project instructions. Everything else is already there or superseded.

## Change list

Standards:

- `standards/model-routing.md`: three tier definitions and the tier table
  (strong values live here); the skill-capable rule reads "cheap, standard, or
  strong"; "Who dispatches" names `stage-standard`; a new "Escalation" section
  (ladder, triggers, order, record, who carries it out, which stop rules it
  replaces) and a standard-tier verification paragraph; "Verify cheap-tier
  output" ends with escalate-then-stop; the Advisor paragraph points at the
  escalation order; the commit-ownership paragraph gains the trailer-in-brief
  sentence.
- `standards/conflict-triage.md`: Plan and Judge read "standard tier,
  `dod-guard:read-standard`". Apply stays cheap. The file keeps naming no model
  or effort value.

Agents (`plugins/dod-guard/agents/`):

- `git mv stage-strong.md stage-standard.md` and `read-strong.md
  read-standard.md`: `model: sonnet`, title and description say standard; the
  all-tools and tools-allowlist lines stay as they are.
- `review-pr-*.md` (four): `model: sonnet`.
- `stage-cheap.md`: description adds "implementing one task from the owner's
  written plan"; the body and the Codex file say
  `dod-guard:stage-standard` at the cheap tier.
- Regenerate `.codex/agents` with the declared generator
  (`convert-claude-agents.mjs --source=plugins/dod-guard/agents
  --output=.codex/agents`, then `--check`), and delete the two old tomls.

Skills and docs:

- `skills/goal-sdlc/SKILL.md`: the Delegation table above; add the escalation
  sentence and the friction-log line.
- `skills/next-ticket/SKILL.md` (about lines 193 to 199): the owner writes the
  step plan, the task is implemented on the cheap tier from it, and a task with
  no writable plan runs at the standard tier.
- `skills/refine-backlog-item/SKILL.md` (about lines 52 to 56): strong becomes
  standard.
- `skills/review-pr/SKILL.md` section 5 "Plan, investigate, judge, merge": the
  agent names (including the registered `dod_guard_read_strong`), strong
  becomes standard, the investigator-batch stop rule becomes escalate-then-stop,
  and the judge and merge-pass stop rules stay.
- `skills/fix-pr-review/SKILL.md`: one sentence for the cheap apply row.
- `USAGE.md` (the tier paragraph near line 89 and the review paragraph near
  line 313 on source `master`): tier prose, plus the "run the loop session on
  sonnet" sentence.
- Not part of this draft: the version bump and release notes, which belong to
  `/publish`.

## Tests to change or add

Existing tests that pin the old names or tiers:

- `goal-sdlc/scripts/model-routing.test.mjs`: `TIER_AGENTS`, the tier-definition
  phrases, the "only the standard stage agent dispatches" test, the
  skill-capable phrases, the stage-cheap misroute text.
- `goal-sdlc/scripts/goal-sdlc-contract.test.mjs` (table rows near lines 160 to
  175 and the tier phrases near line 97).
- `goal-sdlc/scripts/reporting-contract.test.mjs` (the USAGE tier sentence).
- `goal-sdlc/scripts/stage-agent-return.test.mjs` (reads `stage-strong`).
- `next-ticket/scripts/structured-handoff.test.mjs` (the implement sentence).
- `refine-backlog-item/scripts/refinement-routing.test.mjs` and
  `review-pr/scripts/review-pr-contract.test.mjs` (strong tier phrases).
- `complete-pr/scripts/conflict-triage-contract.test.mjs` (stage tier names).
- `codex-migrate/scripts/convert-claude-agents.test.mjs` if it names the old
  agents.

New tests:

- No cell in the goal-sdlc Delegation table says `strong`: strong is only
  reachable through the escalation section.
- The implement row is `cheap` and the next-ticket text requires a written plan
  before dispatch.
- No Claude-side tier agent has `effort: max`.
- The escalation section names its triggers, the advisor step, the one-rung
  rule, the friction-log record, and who carries out an escalated stage.
- The stop rules for malformed judge output, a refused merge pass, and conflict
  triage verification stay stops, and the investigator-batch rule escalates once.
- Each of the three tiers has a stated verification rule in the standard.
- The four review agents and both standard agents default to `sonnet`.

## Rollout and measurement

1. Deliver as one PBI and one PR through the normal workflow, after approval.
   This draft opens neither.
2. Publish through `/publish` only after CI is green; then `/plugin update` and
   `/reload-plugins`, and verify with the new cache version's own helper.
3. Delete `~/.claude/skills/goal-sdlc-next/` only after step 2, and confirm the
   next run's Agent calls name `stage-standard` before trusting it.
4. Pilot on two PBIs. Record, per PBI: cost units from the transcript method,
   BLOCKER and MAJOR findings per PR, fix-review rounds, escalations by stage
   and trigger, and rework commits after the first push. Compare against the
   last five PRs from the 10-08 to 10-15 runs.
5. Proposed exit criteria, to be agreed before the pilot: if more than 30% of
   haiku implementation tasks escalate, or findings per PR rise by more than
   50% over the baseline, move the implement row to standard. That is a
   one-row change in the table and one test.

## Risks

- Haiku implementation quality is unmeasured. Mitigations: the plan contract,
  the owner's independent proof rerun, and the escalation ladder.
- Escalation can cost more than it saves if triggers fire loosely. The
  triggers need a failed check after one repair, and the friction log makes the
  rate visible.
- Sonnet owners are cold-start threads like the opus ones were. Nothing here
  reduces owner context size, which was the largest cost driver; a later change
  could split owners so that long stages hold less context.
- Sonnet lens judges: the four lenses ran on sonnet until 2026-10-08, so this
  is a return to a configuration that existed, not a new one.
- Rename breaks any downstream `.codex/agents` registration of the old names.
  Only this repo and cardcleaner were checked.
- The savings estimate reprices the same tokens. Real sonnet and haiku runs may
  use more.

## Open questions

Decided: N1, rename the agents (2026-10-15).

1. Strong effort when escalating: `high` (proposed) or `medium`?
2. Keep Codex `codex_effort: max` for `gpt-5.6-luna`? No Codex data was
   measured.
3. Where do the two project habits live: the Clean Code read and the single
   `@codex review` rule? Proposed: the project's `CLAUDE.md`.
4. Should the review owner stage become a script-driven flow rather than an
   LLM owner? Out of scope here; it was 10.5% of spend.

## Addendum 2026-10-16 (issue 958): effort versus intelligence

This addendum supersedes the "Stage routing" table above where they differ.
The owner's principle decides every row: haiku for anything that needs a lot of
effort but low intelligence, sonnet only for tasks that need the added
intelligence, and opus only when sonnet or haiku cannot figure it out.

| Stage | Proposed above | Now |
|---|---|---|
| `/submit-draft-pr` | standard | cheap, on the all-tools worker |
| `/complete-pr`: guarded merge and Project finalization | standard | cheap, stops at `merge_conflict` |
| `/review-pr`: owner thread | standard | cheap, on the all-tools worker |
| `/next-ticket`: implement one task from its plan | cheap | cheap for every task, a one-task PBI included, with no owner-edit escape hatch |
| Merge conflict triage: owner, plan, judge | standard | standard |
| Refinement, `/next-ticket`, and `/fix-pr-review` owner threads | standard | standard, because they write plans, classify, or revalidate, and absorb failed rows |

A rerun of a row takes that row's tier. A cheap-model owner never carries out a
failed row: it reports to its dispatcher, which reruns the stage on sonnet and
then on opus.

The first goal-sdlc run measured after 5.7.0 used 31 stage-standard agents on
sonnet, 4 on haiku, 50 read-cheap agents on haiku, and no stage-cheap
dispatch. That is the defect this change closes. Haiku quality on skill-capable
stages is unmeasured. The friction log shows which rows escalate often and
belong one tier higher.
