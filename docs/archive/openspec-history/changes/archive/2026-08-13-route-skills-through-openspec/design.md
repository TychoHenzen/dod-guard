## Context

See proposal.md - Why. Two things are true at once. First, OpenSpec became the
system of record for a unit of work, and several skills kept their own copy of
rules OpenSpec already owns. Second, the proof engine those skills orchestrated
has a defect deletion fixes and de-duplication cannot: the agent under test
authors the command, predicate, and threshold that grades it, so a proof passing
mostly proves the agent believed its own claim.

`openspec instructions <artifact> --change <id>` already returns an artifact's
instruction text, template, resolved output path, and dependencies. A skill that
calls it needs to carry none of that. `src/openspec/steps.ts` already converts
a plan-shaped input into a step array; nothing calls it yet.

### What the proof engine's own investigation found

An investigation dated 2026-07-20 (`docs/shortcomings.md`, since folded in here
and deleted) read `packages/dod-guard/src/` end to end and tested the anti-cheat
premise directly. Eight of its ten findings traced to one root: the agent being
verified retained write authority over the definition of "verified." The
fingerprint and audit-trail work raised the cost of editing the store file from
outside the MCP tools, which was never the threat that mattered - the real
attack surface was authorship, not tampering.

The findings that mattered most for this change's decision to delete the engine
rather than patch it:

- **The threat model only covered out-of-band file edits.** Every one of
  `dod_create`/`dod_refine`/`dod_amend`/`dod_add_node`/`dod_remove_node`
  recomputed and re-stored the fingerprint on every call. An agent wanting a
  weaker proof did not need to tamper; it could amend, and the fingerprint
  quietly followed. The only friction was a warning after more than two
  amendments - not a gate.
- **Machine predicates were trivially satisfiable no-ops.** `output_contains`
  and friends graded whatever the authored command printed. `echo PASS` plus
  `output_contains: "PASS"` passed. Placeholder detection was a fixed regex
  blocklist that could never enumerate every always-succeeding command, and
  even a hit only warned - it never failed the proof.
- **Nothing tied a proof to the actual code state.** No working-tree, build-state,
  or cross-proof coupling existed anywhere in the source. Proofs ran
  independently and could mutate the tree they ran in, so a full PASS meant
  only "each command exited happily at some point," never "the current code
  satisfies all of them simultaneously."
- **The fingerprint omitted most proof-strength fields.** It hashed only
  `command | predicate.type | value`, so editing a threshold like
  `max_function_lines` in the store gutted a proof without changing the
  fingerprint - the one mechanism meant to catch store edits was blind to the
  fields most worth editing.
- **Regression proofs self-captured their own baseline** and passed for free on
  first run, with the baseline itself excluded from the fingerprint above -
  a "no regression" gate whose reference point the graded party chose and
  could edit undetected.
- **Anti-cheat had real teeth only for manual/review proofs, and those were
  entirely opt-in.** A DoD could ship with zero of them; the only mandatory
  predicates were all machine-gameable per the findings above.

Deletion fixed all of this by removing the thing that could be gamed rather
than hardening it further: nobody authors the proof of "did a test bind to
this scenario and actually reach it" except the test itself, existing before
`cover` ever runs.

## Goals / Non-Goals

**Goals:**

- One home for the executable plan, one definition of its shape.
- A scenario's "done" claim is backed by a test that actually ran and actually
  reached the code, not by a command the same agent wrote and can weaken.
- Every skill that plans, executes, or verifies work operates on a change id.

**Non-Goals:**

- `dod-guard backfill` (drafting specs from shipped code with no spec). Dropped
  from this change's scope. Existing code with no spec has no coverage claim
  until someone writes one; that is a separate, later decision.
- Migrating the `~/.claude/dod-store/` content. It is local and untracked. Its
  documents stop being readable by any shipped tool; nothing in the repo owes
  them a conversion path.
- Folding the five `step-*` agent files. They run in cold context and cannot
  fetch a rule from anywhere, so their restatements are transport, not
  duplication.

## Decisions

**The proof engine is deleted, not repaired.** `docs/shortcomings.md` lists ten
findings; five trace to the same cause, that the party being verified also
authors what verification means. Fixing the fingerprint algorithm (finding #4),
adding VCS binding (#3), or tightening the placeholder blocklist (#2) each
patches one symptom of that cause. None of them changes who authors the check.
Deleting predicates and proof commands removes the authorship the defect depends
on: nobody hand-writes the thing that grades them, because the grade comes from
whether a named, pre-existing test reached the code.

**`cover` binds through a marker, not a title match.** The census that motivated
this change found 430 leaves whose entire proof was `findstr` or `grep` against a
string in a file. A scenario-to-test binding by substring title match is the same
mechanism with different syntax - a test named similarly enough to a scenario
would satisfy it without the test asserting anything about that scenario's
behavior. The marker lives in the test file, next to the assertions it makes, so
whoever writes the test states the binding at the point where lying about it
costs the most: right next to the code that would have to actually call through.

**Reachability is measured, not declared.** A test that imports a function and
calls it directly proves the function works. It does not prove a user can reach
it. `cover` runs the bound test under coverage instrumentation and checks
whether the scenario's implementation executed by way of a project-declared
entry point, not merely that it executed. This is the direct answer to
"integration skipping" - a unit test standing in for the fact that nothing wires
the feature to anything a user touches.

**`cover` is a blocking gate here, where the dropped design made it report-only.**
The abandoned `add-scenario-coverage-and-retroactive-specs` proposal kept `cover`
non-blocking because no repository could pass it on day one. That is true and
does not argue for report-only forever - it argues for a ratchet, the same
answer this repo already gives `quality-baseline.json` and
`coverage-baseline.json`. A scenario the baseline has never seen is adopted at
whatever state `cover` finds it in. A scenario the baseline already marked
covered regressing to not-covered is what fails the gate. Existing debt is
allowed; making it worse is not, and the mechanism for that already exists in
this repo, so `cover`'s baseline reuses it rather than inventing a second one.

**Skills fetch run-time guidance, not authoring policy, because the policy that
used to be fetched no longer exists.** The original decision here was that a
skill says "run `openspec instructions dod --change <id>` and follow it" rather
than carrying the DoD authoring policy itself. That policy - predicate types,
proof categories - is deleted along with the engine it configured. What remains
to fetch is scenario-writing guidance and the `steps` artifact's shape; the same
inversion argument applies; the schema is what a project customizes, a SKILL.md
ships frozen in a plugin release.

**One plan home, no working copy.** Unchanged from the original decision: the
plan is `openspec/changes/<id>/steps.json`, committed. `.step-session/` is
deleted outright. The cost is that `/step-by-step <plan-file.md>` stops working;
accepted, same as before.

**`steps` derives from `tasks.md`, not from a DoD tree, because there is no DoD
tree.** The original decision changed `steps.requires` from `dod` to `tasks` so
a change with no spec delta could still produce a plan. With `dod` deleted
outright, this stops being an alternate path and becomes the only path: one step
per `tasks.md` item. `verify_cmd` comes from that task's `cover`-bound test where
one exists; a task with no binding yet gets `manual_required: true`, the same
semantic a `MANUAL:` draft leaf used to carry, expressed without a leaf to carry
it.

**`/tighten` keeps its ledger.** Unchanged: a queue of scanner-ranked candidates
is regenerable output, not a plan. What moves into OpenSpec is the work on a
picked target, which is a change like any other, closing on `cover` instead of
`dod_check`.

**`/adversarial-workflow`'s gate records move to `design.md`.** `dod_adversarial_gate`
stored a GO/REVISE/STOP verdict per phase against a `dod_id`. With no `dod_id`,
the four verdicts become a section of the change's own `design.md` - a decision
record, which is exactly what `design.md` is for elsewhere in this schema.

## Risks / Trade-offs

[A session in flight when this lands loses its `.step-session/`] -> Land it when
no session is running. The repository has one active change and it is not
mid-execution.

[A brand-new blocking gate against zero markers looks identical to the ratchet
failing to adopt anything, so a bug here silently passes everything] -> The
ratchet baseline records which scenarios it has scored, the same way
`quality-baseline.json` records which files it scanned. A scenario absent from
the baseline is adopted, not skipped, and the adoption itself is a diffable
write, so a run that adopts nothing when scenarios exist is visible in the diff.

[Deleting the proof engine deletes ten years - in dod-guard terms, several
months - of authored proof commands with no replacement for the ones that were
real] -> Accepted. A proof command that was actually meaningful becomes a test
the next time someone touches that code, same as any other untested behavior in
this repo's own ratchet model (`untested-sources.txt`).

[`check-skill-hygiene.mjs` proves several requirements, so a bug in it fakes
several passes] -> Unchanged from the original decision: each rule is a separate
flag with its own exit path, and a rule that cannot fail is the failure mode
already documented in this repo. Rules that policed the deleted predicate tables
and `dod_create` fallback are retired along with what they guarded against, and
new rules for the coverage-marker vocabulary get the same fixture-per-rule test.

## Migration Plan

1. Openspec bookkeeping (this commit): rewrite this change's own proposal,
   design, and task list to describe the teardown; drop the superseded
   `add-scenario-coverage-and-retroactive-specs` change and this change's own
   `dod.md`.
2. Delete the proof engine: files, MCP tools, CLI subcommands,
   `check-trace.mjs`, the schema's `dod` artifact. Build and existing non-deleted
   tests green before anything new starts.
3. Build `dod-guard cover`: the marker format, the entry-point declaration, the
   three-outcome report, the ratchet baseline, the CI gate.
4. Rework `steps`: task-bound instead of tree-bound.
5. Rewrite the nine affected skills, one at a time, updating
   `check-skill-hygiene.mjs`'s rule set to match as each skill's vocabulary
   changes.
6. Docs and CLAUDE.md sweep.

Rollback is per commit. The executor commits each verified step, so any step can
be reverted without unwinding the rest.
