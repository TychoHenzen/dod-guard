## Context

See proposal.md - Why. The short version: OpenSpec became the system of record
for a unit of work, and no skill was retired from that job when it did.

Three facts shape the approach.

`openspec instructions <artifact> --change <id>` already returns the artifact's
instruction text, its template, its resolved output path, and its dependencies
with their contents. A skill that calls it needs to carry none of that.

`src/openspec/steps.ts` already converts a DoD tree into a step array. Nothing
imports it. `fetchInstructions` in `src/openspec/fetch-instructions.ts` hardcodes
the artifact id to `dod`, so it cannot resolve the `steps` output path today.

`convert.ts` reads only `dependencies` and `resolvedOutputPath` out of the
instructions JSON. It never parses `instruction`. So the `dod` instruction text
can be rewritten freely without touching `dod_generate`.

## Goals / Non-Goals

**Goals:**

- One home for the executable plan, one definition of its shape.
- Artifact rules fetched at run time, so a skill and the schema cannot drift.
- Every skill that plans, executes or verifies work operates on a change id.

**Non-Goals:**

- Changing the predicate surface, the fingerprint, or any verdict rule.
- Replacing `/opsx:apply`. It stays the executor for a change whose `tasks.md`
  covers the work with no per-step gate.
- Folding the five `step-*` agent files. They run in cold context and cannot
  fetch a rule from anywhere, so their restatements are transport.

## Decisions

**Skills fetch artifact rules at run time.** A skill says "run
`openspec instructions dod --change <id>` and follow it". The alternative was to
keep the rules in the SKILL.md and have the schema's instruction point back at
the skill. That inverts the dependency the wrong way: the schema is what the
CLI resolves per change and per project, and a SKILL.md ships frozen in a
plugin release. A project that customizes its schema would get the plugin's
opinion instead of its own.

**One plan home, no working copy.** The plan is
`openspec/changes/<id>/steps.json`, committed. `.step-session/` is deleted
outright rather than kept as a scratch mirror. A mirror is what produced the
current bug: two files, one authoritative, no rule saying which. The cost is
that `/step-by-step <plan-file.md>` stops working. That is accepted.

**`progress.log` goes.** It was the third record of one fact. The per-step
commit is the durable log, `steps.json` holds status, and `tasks.md` holds the
checkbox. `/cheap-step` used it to remember answered ambiguities; those already
belong in the step `description`, which survives a retry.

**Two records stay, and the skill says why.** `steps.json` `status` and the
`tasks.md` checkbox look like duplication and are not: a checkbox has two
states, and the executor needs four. Without a sentence naming that, the next
reader deletes one of them. The sentence is a requirement, not a comment.

**`steps` requires `tasks`, not `dod`.** Blocking the executable plan behind a
DoD locks out any change with no spec delta, which is exactly what a pure
refactor is. `scripts/ci/check-trace.mjs` already skips a change with no
`dod.md`, so this matches the gate that exists. A DoD still precedes the plan
whenever there is one, because `dod` requires `specs` and the agent generates
in artifact order.

Alternative considered: give `/quality-refactor` its own schema with no `dod`
artifact. Rejected as two schemas to maintain for one missing dependency edge.

**The steps command generates a skeleton, not a finished plan.**
`dodTreeToSteps` cannot know which files a step touches or whether its surface
is visual. It emits `files: []` and `verify_surface: "code"`, and the `steps`
instruction tells the agent to fill both. The split is deliberate: the fields
that must never drift from the DoD (id, deps, verify_cmd, manual_required) are
derived by code, and the two fields that need judgment are left to judgment.
Generating them by guess would be worse than leaving them empty, because an
empty `files` list reads as unfilled while a wrong one reads as decided.

**The leaf title round trip gets fixed here, not later.** `dod_generate`
converts the spec deltas, renders markdown, and reads it back through the
parser. `author.ts` never writes a concrete leaf's title, so `parser.ts` falls
back to `title: desc` and the scenario heading is lost. `amendChangedLeaf`
then passes command, predicate and description but no title, so a regenerated
leaf keeps the THEN text of a scenario version that no longer exists. Five
leaves in this change's own DoD were already stale that way before it was
noticed.

It belongs in this change because `dodTreeToSteps` reads exactly that field
into the step title. Shipping `dod-guard steps` on top of a field known to hold
stale text would build the new seam on a broken one. The fix renders the title,
parses it back, and gives amend a title parameter. A DoD already in the store
keeps its current titles until its next regeneration, which is acceptable
because nothing reads a leaf title today.

**`/tighten` keeps its ledger.** A queue of scanner-ranked candidates is not a
plan. It is regenerable output, and rebuilding it from the scan is cheaper than
storing it in a change. What moves into OpenSpec is the work on a picked
target, which is a change like any other.

## Risks / Trade-offs

[A session in flight when this lands loses its `.step-session/`] -> Land it
when no session is running. The repository has one active change and it is not
mid-execution.

[`check-skill-hygiene.mjs` proves five requirements, so a bug in it fakes five
passes] -> Each rule is a separate flag with its own exit path, and the script
gets a test that feeds it a known-bad fixture per rule. A guard that cannot
fail is the failure mode this repository already documented.

[The `dod` instruction grows long, and every `openspec instructions dod` call
pays for it] -> It is fetched once per DoD generation, not per proof. The
alternative is the current duplication.

[Deleting `/step-by-step`'s plan-file path removes a working entry point] ->
Accepted and stated in the proposal. Opening a change is one command.

## Migration Plan

Order matters. The schema and the CLI land before the skills that call them,
so no skill ever points at something that does not answer yet.

1. Schema: fill the `dod` instruction, flip `steps.requires`, tighten
   `templates/steps.json`.
2. Code: `dod-guard steps`, plus `fetchInstructions` taking an artifact id.
3. `scripts/ci/check-skill-hygiene.mjs` with its rules, red at this point.
4. Skills, one per step, until the guard goes green.
5. Docs and `.gitignore`.

Rollback is per commit. The executor commits each verified step, so any step
can be reverted without unwinding the rest.
