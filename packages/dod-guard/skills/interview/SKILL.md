---
name: interview
description: Pin down requirements before any implementation task, feature request, bug fix, or refactor, and before writing code or plans. Use when requirements are unclear, when there is a risk of wrong assumptions, or when the user says "build X" without specs. It replaces brainstorming for implementation work. Read the existing code, then question the user one item at a time. Confirm a written requirements summary, then run an adversarial review of that spec. Store a machine-checkable Definition of Done through dod_create and hand off to an executor skill. The output is one dod_id plus its markdown. This skill never implements.
---

# Interview

## 1. The gate

Open by telling the user you are gathering requirements and will write no
code yet. Until the user confirms the requirements summary in section 4,
write no source file, no test, no plan file, and no scratch design. Reading
is allowed. Editing is not.

If the user pushes for code before the summary is confirmed, restate the
gate once and continue with questions.

## 2. Research before the first question

Read the code that this change touches before you ask anything. Cover the
modules named in the request, their callers, their tests, and any plan file
under `docs/plans/`. Find the project's test runner, linter, and formatter.

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

## 3. Questions, one at a time

Ask one question per message. Wait for the answer. Let the answer pick the
next question.

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
check. Keep asking until all four hold for every requirement.

Re-read code mid-interview whenever an answer contradicts what you found.

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
answer goes into `open_questions` instead, and never becomes a scenario.
An answer is confirmed only when the user gave it directly, or confirmed
it in the section 4 summary. An answer you inferred from reading the code
is not confirmed, even if it seems obviously right. This matters because
of how the generator works. Every scenario becomes a leaf, and a leaf is a
proof the work must satisfy. So a scenario built from a guess becomes a
proof of a guess. `open_risks` keeps its own job from earlier in this
section, a company-baseline row that genuinely does not apply. Do not put
unconfirmed answers there instead.

Where the unconfirmed answers go depends on which path built the document.

The `dod_create` fallback takes them directly, as
`sections.open_questions` in the tool call.

A generated DoD has no such field. `dod_generate` sets `requirements` and
nothing else, and no tool adds a section afterwards. Do not hand-edit the
rendered `dod.md` to add one. Every write regenerates that file from
canonical storage, and `dod_check` writes on every run, so the next
instruction in section 7 would erase it.

Put them in the change instead, under an "Open questions" heading in its
`proposal.md` or `design.md`. That is the right home anyway. OpenSpec owns
intent and dod-guard owns proof, and an unanswered question is intent. The
change's own files survive regeneration, and `openspec archive` keeps them
with the shipped change.

The spec delta decides the shape of the tree, not you. Every
`### Requirement:` heading becomes one group node. Every `#### Scenario:`
under it becomes one leaf. Take a change with three requirements and two
scenarios each. Its DoD carries three groups of two leaves, whatever
nesting or grouping choice the interview would otherwise have made.

Whether a scenario becomes a machine-checkable leaf or a `MANUAL:` draft
depends on one rule. Does its `THEN` line hold a backticked code span with
a space in it, whose first word is a known tool? `npm`, `npx`, `node`,
`git`, `openspec`, `dod-guard`, `grep`, `findstr`, `tsc`, and `biome` are
the known tools. A scenario that puts a real command there becomes a
concrete leaf, as long as that command also runs on this OS. That leaf
proves itself by exit code 0. A scenario that only describes an outcome in
prose becomes a draft leaf with a `MANUAL:` intent. A draft holds the
document at INCOMPLETE.

So write the proving command into the THEN line, not just the outcome:

```markdown
## ADDED Requirements

### Requirement: CSV export serializer
The system SHALL quote a field that holds an embedded comma.

#### Scenario: Embedded comma survives a round trip
- **WHEN** a row field contains a comma
- **THEN** `npm test -- csv-serializer.test.ts` exits 0

#### Scenario: Operator confirms the file opens cleanly
- **WHEN** a completed export is downloaded
- **THEN** the file opens in the spreadsheet tool with the right columns
```

The first scenario becomes a concrete leaf, because its THEN line names a
runnable `npm` command. The second becomes a `MANUAL:` draft, because its
THEN line only describes an outcome. Put the command in a scenario's THEN
line yourself while you draft the delta, if it deserves a machine check.
Nothing later promotes prose into a command for you.

Every leaf the converter generates carries predicate `exit_code` at value
0 and category `other`. It never picks a richer predicate or a category,
and it never sets `timeout_ms` or `advisory`. Those choices happen after
generation, in section 7, through `dod_amend` and `dod_refine`, using the
tables below.

A predicate is `{type, value, timeout_ms}`. These 10 types are the whole
vocabulary, and anything else is rejected.

| Predicate | Passes when |
|---|---|
| `exit_code` | the command exits with `value` |
| `exit_code_not` | the command exits with anything but `value` |
| `output_contains` | stdout plus stderr contains the substring `value` |
| `output_not_contains` | that text does not contain `value` |
| `output_matches` | that text matches the regex `value` |
| `output_not_matches` | that text does not match the regex `value` |
| `tdd` | the command failed on an earlier run, then passes |
| `adversarial` | the gate for phase `value` is recorded GO |
| `holdout` | the holdout test fingerprint is unchanged |
| `convergence` | the phase 4 convergence audit reached GO |

`category` takes one of four values.

| Category | Use for |
|---|---|
| `behavioral` | a check that the feature does the right thing |
| `wiring` | a check that the piece is reachable from the real system |
| `test_audit` | a gate over the tests themselves |
| `other` | anything the three above do not fit |

Amend `timeout_ms` above the 120000 default for a slow tool.

A proof often names a test file the implementer has not written yet. Amend
those to a regex, not an exact name. Use `output_matches` with a pattern
like `"export.*csv"`, so a reasonable naming choice still passes.

The generated tree carries no company baseline, no integration proof pair,
and no `MANUAL:` inspection leaf for visual work. Add all three by hand,
after generation, as described next.

### Company baseline

The generator never applies the company baseline, so add it by hand after
`dod_generate` runs, using `dod_add_node`.

Set `type` from the request when the change lacks a company-baseline node
of its own. A bug, defect, regression, or incident is `"bug"`. A feature,
enhancement, refactor, or new component is `"general"`. Reserve
`"minimal"` for work the user has explicitly held to no baseline.

Read `standards/dod-baselines.md` and take the minimum proofs for that work
type. Its `manual` predicate column is out of date, so add every row it
marks manual as a `MANUAL:` draft leaf instead. Read
`standards/language-commands.md` for the command that fits this project's
language.

Set lint and format proofs to the counts from section 2. Under 10
violations, demand zero. At 10 or more, scope the proof to changed files or
assert the count does not rise. Record both counts in the summary you give
the user, so a later reader can check the bar.

A baseline row can genuinely fail to apply, because the project has no
linter or no test runner. Never drop such a row in silence. Tell the user
about the omission.

### Integration proof

The generator adds no integration proof pair on its own. Add one after
generation, with `dod_add_node`, for every feature the tree covers. The
wiring leaf greps for the import, the registration, or the route that makes
the piece reachable. The behavioral leaf drives the feature through the
system's real entry point, not through the component's own API.

Wiring alone catches "registered but broken". Behavior alone catches "works
in the harness, unreachable in production". Neither may become a human step.
Place this pair last among the machine-checkable leaves.

### Human judgement

dod-guard has no human-verification predicate. A step only a person can judge
becomes a draft leaf whose `intent` starts with the literal prefix `MANUAL:`.
Other skills key off that prefix, so write it exactly. Never invent a command
that pretends to check a human's opinion.

The generator turns a prose-only scenario into a `MANUAL:` draft
automatically, but it adds no inspection leaf where the change adds none.
After generation, add a `MANUAL:` inspection leaf with `dod_add_node` when
the work touches `rendering/`, `ui/`, `graphics/`, `shaders/`, `sprites/`,
`scenes/`, or `levels/`. Add one when a leaf intent mentions render,
display, show, look, appear, or visual. Add one when it mentions movement,
collision, spawn, ai behavior, or gameplay.

A build that compiles proves nothing about what the screen shows. When in
doubt, add the leaf. A needless check costs a minute. A missing one ships an
unverified change.

### Test-first requirements

The baseline makes test-first work non-negotiable. A bug fix needs a
regression test written red first. A feature needs unit tests written red
first. This is the one case a single requirement needs two leaves, because
a `tdd` proof alone cannot tell a real assertion from `assert true`. Add
both with `dod_add_node` after generation:

1. A leaf whose command greps the test file for a real assertion, predicate
   `output_matches`, category `test_audit`. Example command:
   `grep -nE "expect.*(header|comma|empty)" src/export.test.ts`.
2. A leaf whose command runs that test, predicate `tdd` at value 0,
   category `behavioral`. Example command: `npm test -- export.test.ts`.

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

## 7. Generate the document, then prove it runs

Call `dod_generate` with `change_id`, the kebab-case name `/opsx:propose`
gave the change, and `cwd`. It reads that change's spec delta through the
OpenSpec CLI, converts every `### Requirement:` and `#### Scenario:` into
the tree section 5 described, and writes `dod.md` to
`openspec/changes/<change_id>/dod.md`. The specs artifact must exist before
you call it, because `dod_generate` depends on it.

`dod_generate` is not reachable yet in the deployed plugin. This repo's
skills run from the installed plugin cache, and that tool has not shipped
there as of this session. If the call is unavailable, fall back to
`dod_create` as described below.

`dod_create` stays the fallback for work with no OpenSpec change, and for
any session where `dod_generate` is not reachable. Call it with `title`,
`goal`, `type`, `cwd`, `markdown_path`, `sections`, and `roots`. `type` is
`"bug"`, `"general"`, or `"minimal"`. `sections` takes `requirements`,
which is required, plus optional `decisions`, `current_state`,
`research_notes`, `open_questions`, and `open_risks`. Never pass `dod_id`,
because the tool rejects it. Point `markdown_path` at
`docs/plans/YYYY-MM-DD-<topic>.md`.

In this fallback you build `roots` by hand, so you need the node shape the
generator would otherwise produce. A node with `children` is a group. A node
without `children` is a leaf, and each leaf proves one behavior on its own. A
leaf is concrete when `refinement` is `"concrete"`, and it then carries
`command`, `predicate`, `description`, and `category`. A leaf is draft when
`refinement` is `"draft"`, and it carries `intent` and nothing else. Set
`advisory: true` on a leaf whose failure should be reported without failing
the run. Mirror the spec delta: one group per requirement, one leaf per
scenario.

Create through one of the two tools, never by writing the markdown
yourself. The proofs live in canonical storage, so editing the rendered
file cannot weaken them.

If the MCP server is not connected at all, write the markdown with the
Write tool instead. Then tell the user plainly that the proofs are not
locked and that anti-cheat verification is off for this document.

Right after creation, record the review with `dod_adversarial_gate` at
`phase: 1`, passing `dod_id`, `verdict`, `lenses`, and `summary`. Each lens
entry is `{lens, findings, mandatory_minimum_met}`.

Then run `dod_check` with the `dod_id` and no `nodePath`, before any code
exists. Sort every leaf result into one of two piles:

1. Expected to fail: the command ran and the feature is simply absent.
2. Mis-authored: a missing tool, a wrong path, a shell error, a placeholder,
   or a proof that passes already and therefore proves nothing.

Fix every mis-authored leaf before you hand off. Use `dod_amend` with
`dod_id`, `node_path`, `new_command`, `new_predicate`, `new_description`,
and the required `reason`. Add `amend_justification` once a node has been
amended three times. Use `dod_refine` with `mode: "concretize"` or
`mode: "subdivide"` to turn a draft into a proof or into children. Use
`dod_add_node` with `parent_path` and `title` for a check you missed, and
for the company baseline, integration proof, human judgement, and
test-first leaves from section 5. Re-run `dod_check` until only the
expected-to-fail pile remains.

## 8. Hand off and stop

Report the `dod_id`, the root group count, the total leaf count, the
concrete count, the draft count, and the `MANUAL:` count. Report the gate
verdict and the markdown path. Report the baseline run as the number of
leaves that passed and the number that failed as expected. Then name the
executor.

| Shape of the work | Executor |
|---|---|
| 5 or more discrete steps | `/dod-guard:step-by-step` |
| the same, with evomcp fanout per step | `/dod-guard:cheap-step` |
| interdependent sub-problems, regression risk, unknown unknowns | `/dod-guard:ratchet`, at its Phase B |
| quality or security gates needed at each stage | `/dod-guard:adversarial-workflow`, resuming at its Phase 2 |

Tell the user which one you picked and why, in one sentence. A caller
outside MCP verifies a subtree with
`dod-guard check --dod-id=<id> --node-path=<path> --quiet`.

Then stop. Do not start the work.
