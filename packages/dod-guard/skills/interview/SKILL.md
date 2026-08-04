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

## 5. From requirements to leaves

Turn the confirmed summary into a tree of TaskNode objects. A node with
`children` is a task group. A node without `children` is a leaf, and each
leaf proves exactly one behavior that can be checked on its own.

Keep the tree three levels deep at most: roots, then two to four groups per
root, then leaves. Deeper than that means you over-decomposed. Give lint,
format, and the full test suite a root group of their own, apart from
feature work. A scoped check on a feature should not drag the whole suite in.

A leaf is `concrete` when `refinement` is `"concrete"`. It then carries
`command`, `predicate`, `description`, and `category`. A leaf is `draft`
when the check cannot be written yet. A draft leaf carries `intent` and
nothing else. Drafts hold the whole document at INCOMPLETE, which is what
you want for work that is still open. Set `advisory: true` on a leaf whose
failure should be reported without failing the run.

Expect roughly half the leaves concrete and half draft. An all-concrete tree
means you guessed at commands you cannot know yet. An all-draft tree means
nothing is verified structurally.

A draft `intent` names a behavior a later check can confirm. "Empty result
set returns a header-only file" works. "Export endpoint" does not, because
that is a group title rather than a behavior.

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

Set `timeout_ms` above the 120000 default for a slow tool.

A proof often names a test file the implementer has not written yet. Write
those as regex, not as exact names. Use `output_matches` with a pattern like
`"export.*csv"`, so a reasonable naming choice still passes.

### Company baseline

Set `type` from the request. A bug, defect, regression, or incident is
`"bug"`. A feature, enhancement, refactor, or new component is `"general"`.
Reserve `"minimal"` for work the user has explicitly held to no baseline.

Read `standards/dod-baselines.md` and take the minimum proofs for that work
type. Its `manual` predicate column is out of date, so turn every row it
marks manual into a `MANUAL:` draft leaf instead. Read
`standards/language-commands.md` for the command that fits this project's
language.

Adjust lint and format proofs to the counts from section 2. Under 10
violations, demand zero. At 10 or more, scope the proof to changed files or
assert the count does not rise. Write both counts into the `research_notes`
section so a later reader can check the bar.

A baseline row can genuinely fail to apply, because the project has no
linter or no test runner. Never drop such a row in silence. Record the
omission in the `open_risks` section and raise it with the user.

### Integration proof

Every feature in the tree needs two leaves, both required. The wiring leaf
greps for the import, the registration, or the route that makes the piece
reachable. The behavioral leaf drives the feature through the system's real
entry point, not through the component's own API.

Wiring alone catches "registered but broken". Behavior alone catches "works
in the harness, unreachable in production". Neither may become a human step.
Place this pair last among the machine-checkable leaves.

### Human judgement

There is no human-verification predicate. A step only a person can judge
becomes a draft leaf whose `intent` starts with the literal prefix `MANUAL:`.
Other skills key off that prefix, so write it exactly. Never invent a command
that pretends to check a human's opinion.

Some changes need a person to look at the result. Add a `MANUAL:` inspection
leaf when the work touches `rendering/`, `ui/`, `graphics/`, `shaders/`,
`sprites/`, `scenes/`, or `levels/`. Add one when a leaf intent mentions
render, display, show, look, appear, or visual. Add one when it mentions
movement, collision, spawn, ai behavior, or gameplay.

A build that compiles proves nothing about what the screen shows. When in
doubt, add the leaf. A needless check costs a minute. A missing one ships an
unverified change.

### Test-first requirements

The baseline makes test-first work non-negotiable. A bug fix needs a
regression test written red first. A feature needs unit tests written red
first. This is the one case where one requirement takes two leaves, because
a `tdd` proof alone cannot tell a real assertion from `assert true`:

```json
[
  { "title": "Export test asserts something real",
    "refinement": "concrete",
    "command": "grep -nE \"expect.*(header|comma|empty)\" src/export.test.ts",
    "predicate": { "type": "output_matches", "value": "expect.*(header|comma)" },
    "category": "test_audit",
    "description": "The test asserts on export behavior, not on a constant" },
  { "title": "Export test is red first, then green",
    "refinement": "concrete", "command": "npm test -- export.test.ts",
    "predicate": { "type": "tdd", "value": 0 }, "category": "behavioral",
    "description": "The test fails before the exporter exists, then passes" }
]
```

### Worked payload

```json
{
  "title": "CSV export for the invoice list",
  "goal": "Operators download the filtered invoice list as CSV",
  "type": "general",
  "cwd": "/srv/billing",
  "markdown_path": "docs/plans/2026-08-04-invoice-csv-export.md",
  "sections": { "requirements": "R1 ... R7", "current_state": "lint 42, format 0" },
  "roots": [
    {
      "title": "CSV export",
      "refinement": "draft",
      "intent": "Serialize and serve the filtered invoice list",
      "children": [
        {
          "title": "Serializer quotes embedded commas",
          "refinement": "concrete",
          "command": "npm test -- csv-serializer.test.ts",
          "predicate": { "type": "exit_code", "value": 0 },
          "description": "A field holding a comma survives a round trip",
          "category": "behavioral"
        },
        {
          "title": "Empty result set returns a header-only file",
          "refinement": "draft",
          "intent": "Prove the zero-row response still carries the header line"
        },
        {
          "title": "Export route is registered",
          "refinement": "concrete",
          "command": "grep -rn \"invoices/export\" src/routes/index.ts",
          "predicate": { "type": "output_matches", "value": "invoices/export" },
          "description": "The route table reaches the export handler",
          "category": "wiring"
        },
        {
          "title": "Download works through the running server",
          "refinement": "concrete",
          "command": "./scripts/serve-and-get.sh /invoices/export?status=open",
          "predicate": { "type": "output_contains", "value": "invoice_id," },
          "description": "A live HTTP request returns CSV with a header row",
          "category": "behavioral"
        },
        {
          "title": "Operator confirms the file opens in the spreadsheet tool",
          "refinement": "draft",
          "intent": "MANUAL: open a downloaded export in Excel and check the columns"
        }
      ]
    }
  ]
}
```

## 6. Adversarial review of the spec

Dispatch five lenses in parallel, over the confirmed summary and the tree
you just built. Security uses `subagent_type: "dod-guard:adversarial-security"`.
Assumptions, Testability, Consistency, and Implementability each use
`subagent_type: "dod-guard:adversarial-spec-reviewer"`.

These lenses run with clean context and cannot see this conversation. Never
point a lens at a file path or an earlier message. Paste all of this into
every prompt as literal text:

1. The lens name.
2. The user's original request, word for word.
3. The goal, the work type, and the language and stack.
4. The project layout you found in section 2.
5. The requirements and the tree.

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

On `REVISE`, fix the spec and the tree, then dispatch the lenses again. Cap
this at 3 rounds. After a third `REVISE`, stop and ask the user for an
explicit override. On `STOP`, report the blocker to the user and abort.

## 7. Create the document, then prove it runs

Call `dod_create` with `title`, `goal`, `type`, `cwd`, `markdown_path`,
`sections`, and `roots`. `type` is `"bug"`, `"general"`, or `"minimal"`.
`sections` takes `requirements`, which is required, plus optional
`decisions`, `current_state`, `research_notes`, `open_questions`, and
`open_risks`. Never pass `dod_id`, because the tool rejects it. Point
`markdown_path` at `docs/plans/YYYY-MM-DD-<topic>.md`.

Create through the tool, never by writing the markdown yourself. The proofs
live in canonical storage, so editing the rendered file cannot weaken them.

If the MCP server is not connected, write the markdown with the Write tool
instead. Then tell the user plainly that the proofs are not locked and that
anti-cheat verification is off for this document.

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
`dod_add_node` with `parent_path` and `title` for a check you missed. Re-run
`dod_check` until only the expected-to-fail pile remains.

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
