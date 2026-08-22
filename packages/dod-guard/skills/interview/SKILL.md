---
name: interview
description: Pin down requirements before any implementation task, feature request, bug fix, or refactor, and before writing code or plans. Use when requirements are unclear, when there is a risk of wrong assumptions, or when the user says "build X" without specs. It replaces brainstorming for implementation work. Read the existing code, then present every open question together with suggested multiple-choice answers. Confirm a written requirements summary, then run an adversarial review of that spec. Write the resulting scenarios into an OpenSpec change and mark how each one binds to a test, then hand off to an executor skill. The output is a change id. This skill never implements.
---

# Interview

## Agent dispatch compatibility

Resolve `<agent-definitions-dir>` before dispatching a dod-guard agent. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/agents`. In Codex, use the `agents` directory beside the parent `skills`
directory that contains this loaded `SKILL.md`.

For every `dod-guard:<name>` dispatch:

- Claude uses `dod-guard:<name>`.
- Codex uses `dod_guard_<name>`, with hyphens converted to underscores, when that custom agent is
  registered.
- If the Codex custom agent is unavailable, read `<agent-definitions-dir>/<name>.md` completely.
  Spawn `explorer` when its `tools` omit `Write` and `Edit`. Spawn `worker` otherwise.
  Include the definition body and task briefing in the spawn message.
- Preserve every clean-context, model-separation, dispatch-cap, and return-shape rule below.

## 1. The gate

Open by telling the user you are gathering requirements and will write no
code yet. Until the user confirms the requirements summary in section 4,
write no source file, no test, no plan file, and no scratch design. Reading
is allowed. Editing is not.

If the user pushes for code before the summary is confirmed, restate the
gate once and continue with questions.

## 2. Research before the first question

Read the code that this change touches before you ask anything. Cover the
modules named in the request, their callers, and their tests. Find the
project's test runner, linter, and formatter.

Count the pre-existing lint violations and format violations now, with the
project's own commands. Record both numbers. Section 5 needs them, and they
are worthless once you start editing.

Ground every question in what you read. Ask "the existing importer rejects
empty rows at parser.ts:40, should the exporter do the same?" rather than
"how should errors work?".

Some answers live outside the repository. When a question turns on a library's
real behavior, an algorithm, or a published standard, look it up with
WebSearch or WebFetch. Tell the user what you found before you ask the
follow-up.

## 3. Present every open question together

Before asking, identify every decision the current repository evidence leaves
open. Present all of those questions in one turn. Do not defer a known question
to a later turn because another answer might affect it. State any dependency in
the question or its options instead.

Give each question 3 or 4 mutually exclusive suggested answers. Put the
recommended answer first and mark it `(Recommended)`. Add one short tradeoff or
effect to every option. Always allow a custom answer, such as `Other: ...`,
without requiring the user to rewrite a suggested answer. End with a compact
reply format such as `Reply with 1A, 2C, 3B, plus any custom details.`

Use `AskUserQuestion` or the runtime's equivalent only when it can contain the
complete question set with 3 or 4 options per question. If the tool limit is
smaller, put the complete numbered multiple-choice set in the message instead.
Never split known questions across turns merely to fit a tool limit.

Floors by size of change. Count decision-driving questions, not the options
inside one question.

1. One file, one function: at least 2 questions.
2. One to three files, one component or layer: at least 3 questions.
3. Four to eight files, or two or more layers: at least 5 questions.
4. Nine or more files, or three or more projects or layers: at least 6.

Ambiguity grows with cross-layer reach. A change crossing storage, logic,
events, and interface raises a contract question at every seam. Probe each
seam for anything at tier 3 or above.

The floor is not a finish line. A requirement is done on four counts: one
reading, defined behavior on bad input, a set scope boundary, and an agreed
check. Include every unresolved count in the same question set.

Re-read code mid-interview whenever an answer contradicts what you found.
If an answer creates a new ambiguity that could not have been identified from
the repository or the original request, send one follow-up set containing every
new open question. Do not repeat settled questions.

Label every question Low, Medium, or High. The label names what a wrong
answer costs. Low means the work absorbs a wrong answer cheaply. High means
a wrong answer wastes the build or ships the wrong behavior. Order the complete
set from High risk to Low risk, because a High-risk answer can change later choices.

## 4. The summary the user confirms

Present one structured summary with these headings: goal, behavior included,
behavior excluded, inputs, outputs, error cases, constraints. Put the
excluded list in writing, because that is where late scope creep starts.

Ask the user to confirm it. Do not create anything until they do. If they
correct any part, apply the correction and present the summary again.

## 5. From requirements to a spec delta

Turn the confirmed summary into an OpenSpec change with `/opsx:propose`.
Give it the goal and the requirements from section 4. That workflow creates
the change directory, `proposal.md`, `design.md`, `tasks.md`, and the spec
delta at `specs/<capability-path>/spec.md`. Stop after it presents the
artifacts. Do not start implementation from inside this skill.

Before you write, sort every interview answer into one of two piles. A
confirmed answer becomes a requirement and its scenarios. An unconfirmed
answer becomes neither, and never becomes a scenario. An answer is
confirmed only when the user gave it directly, or confirmed it in the
section 4 summary. An answer you inferred from reading the code is not
confirmed, even if it seems obviously right. This matters because a
scenario built from a guess is a claim of done built on a guess.

Write every unconfirmed answer under an "Open questions" heading in the
change's `design.md`. OpenSpec owns intent, and an unanswered question is
intent. The change's own files survive to `openspec archive`, so the
question travels with the shipped change.

The spec delta decides the shape of the work, not a generator. Every
`### Requirement:` heading names one behavior. Every `#### Scenario:`
under it names one WHEN/THEN case that behavior must hold for. Write the
scenario as an observable outcome, not as an implementation step:

```markdown
## ADDED Requirements

### Requirement: CSV export serializer
The system SHALL quote a field that holds an embedded comma.

#### Scenario: Embedded comma survives a round trip
- **WHEN** a row field contains a comma
- **THEN** the exported field is wrapped in quotes and round-trips back to
  the original value on re-import

#### Scenario: Operator confirms the file opens cleanly
- **WHEN** a completed export is downloaded
- **THEN** the file opens in the spreadsheet tool with the right columns
```

A scenario names what must be true, never the proof. `dod-guard cover`
decides whether it counts as done by finding a test bound to it, not by
running a command a scenario names. That is the whole point of the
switch: no agent authors its own passing grade.

### Binding a scenario to a test

A scenario counts as covered only when a test carries a marker that names
it. Write the marker on the line directly above the test function call
that exercises the scenario, using the comment syntax for the project's
language:

```
// covers: <group>/<capability> :: <requirement title> :: <scenario title>   (JS/TS/Go/Rust/C/Java)
# covers: <group>/<capability> :: <requirement title> :: <scenario title>    (Python/Ruby/Shell)
```

`<group>/<capability>` is the spec's own id, the same path segments as
`openspec/specs/<group>/<capability>/spec.md`. `<requirement title>` and
`<scenario title>` are the exact text after `### Requirement:` and
`#### Scenario:` in the delta, not a paraphrase. `dod-guard cover` matches
on that text, so a marker that drifts from the delta's wording binds
nothing.

You are not writing the test itself in this skill; the executor does that
during implementation. What you do here is tell the executor, in the
handoff and in the scenario's own wording, which test file should carry
the marker, and confirm the scenario is phrased as something a single test
can observe. A scenario nobody could bind a marker to (too many outcomes
bundled into one WHEN/THEN) should split into two scenarios now, while
splitting is cheap, rather than after the executor discovers it cannot
write one test that proves it.

A marker with no test call after it binds nothing, and `dod-guard cover`
reports the scenario the same as if the marker were never written. Note
that as a risk in the handoff for any scenario the executor might satisfy
that way by mistake.

## 6. Adversarial review of the spec

Dispatch five lenses in parallel, over the confirmed summary and the spec
delta section 5 wrote. Security uses `subagent_type: "dod-guard:adversarial-security"`.
Assumptions, Testability, Consistency, and Implementability each use
`subagent_type: "dod-guard:adversarial-spec-reviewer"`.

These lenses run with clean context and cannot see this conversation. Never
point a lens at a file path or an earlier message. Paste all of this into
every prompt as literal text:

1. The lens name.
2. The user's original request, word for word.
3. The goal, the work type, and the language and stack.
4. The project layout you found in section 2.
5. The spec delta section 5 wrote, pasted as text.

Consistency cannot find scope drift without the original request.
Implementability cannot judge fit without the layout. Give nothing beyond
that list. The agents already carry their persona, their attack surface, and
their output rules.

Each lens returns findings as `SEVERITY`, `TARGET`, `PROBLEM`, `SUGGESTION`,
or returns `NO_FINDINGS:` plus a justification. Re-dispatch any lens that
answers with neither.

Count the severities across all five lenses:

1. 0 critical and at most 2 major: verdict `GO`.
2. 1 or more critical, or 3 or more major: verdict `REVISE`.
3. Any blocker: verdict `STOP`.

On `REVISE`, fix the summary and the spec delta, then dispatch the lenses
again. Cap this at 3 rounds. After a third `REVISE`, stop and ask the user
for an explicit override. On `STOP`, report the blocker to the user and
abort.

## 7. Record the review, then check the ground you are handing off

Record the adversarial verdict from section 6 under a "Phase 1 review"
heading in the change's `design.md`: the verdict, each lens's finding
count, and a one-line summary per lens. That is the change's own record,
in the place `design.md` exists for.

Before you hand off, confirm the spec delta itself is coherent. Run
`openspec validate <change-id> --strict` and fix anything it flags. This
does not run `dod-guard cover`, and it should not: no test exists yet, so
every scenario in this change is expected to be unwired. `cover` is the
executor's gate, run once real tests exist and carry `covers:` markers,
not this skill's.

## 8. Hand off and stop

Report the change id. Report the requirement count and the scenario count
from the spec delta. Report the adversarial verdict from section 6. Name
every scenario whose test binding is still an open item, per section 5,
so the executor knows what to close before `dod-guard cover` reports it
as bound. Then name the executor.

| Shape of the work | Executor |
|---|---|
| 5 or more discrete steps | `/dod-guard:step-by-step` |
| interdependent sub-problems, regression risk, unknown unknowns | `/dod-guard:step-by-step`, with the risks called out in the handoff |
| quality or security gates needed at each stage | `/dod-guard:adversarial-workflow`, resuming at its Phase 2 |
| a small change whose own `tasks.md` covers the work, with no per-step gate needed | `/opsx:apply` |

Tell the user which one you picked and why, in one sentence. A caller
outside a skill session verifies a change's scenarios with
`dod-guard cover <change-id>`.

Then stop. Do not start the work.
