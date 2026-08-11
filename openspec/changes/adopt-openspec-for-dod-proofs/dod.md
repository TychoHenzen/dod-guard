# adopt-openspec-for-dod-proofs - Requirements Spec

<claude_instructions>
**For the implementer:** Work through each task below.
1. Mark a task `[>]` when you begin working on it.
2. Call `dod_check` to verify proofs - do NOT mark proofs manually.
3. A task group is complete when ALL its concrete proofs pass via `dod_check`.
4. Use `dod_refine` to turn a draft leaf into a concrete proof or subdivide into child tasks.
5. If a proof cannot be met, use `dod_amend` to modify it with a reason.
6. Continue until `dod_check` returns PASS - then stop and report done.

**Behavioral predicates only.** Each proof is a concrete behavioral claim.
Read failure diagnoses carefully - they tell you WHAT went wrong and what to fix.
Proofs run on the HOST OS - write OS-correct commands (no bash on Windows).

**CWD:** `C:\Users\siriu\mcp-servers\dod-guard`

**Anti-cheat:** Proofs stored canonically in MCP storage.
`dod_check` executes commands from the canonical copy, not this markdown file.
</claude_instructions>

**Goal:** Definition of Done proof tree generated from the change's spec deltas

**Date:** 2026-08-11
**Target:** `C:\Users\siriu\mcp-servers\dod-guard`
**DoD ID:** `db3c5079-5733-4a3c-912d-d8cb0c10a19f`

---

## Requirements

<requirements>
<requirements>
Generated from OpenSpec spec deltas.
</requirements>
</requirements>

---

## Definition of Done

<definition_of_done>

### ASSUMPTION marker does not trip todo-marker [~]

  - [~] **Draft**: MANUAL: the `todo-marker` rule does not report a violation for that line

### assumption-marker rule counts without failing [~]

  - [~] **Draft**: MANUAL: the scan reports the new count without exiting non-zero for that reason alone
  - [~] **Draft**: MANUAL: `.github/quality/quality-baseline.json` holds that file's `assumption-marker` count

### convention is documented [~]

  - [~] **Draft**: MANUAL: it states that a non-obvious guess gets an `ASSUMPTION: <what and why>` comment at that line

### audit resolves each marker to one verdict [~]

  - [~] **Draft**: MANUAL: it reports every `ASSUMPTION:` comment found by `grep -rn "ASSUMPTION"` together with one verdict per comment
  - [~] **Draft**: MANUAL: every comment it found carries a verdict. None are left unreported

### interview writes an OpenSpec change [~]

  - [~] **Draft**: MANUAL: the skill writes a proposal and spec deltas under `openspec/changes/<id>/` instead of calling `dod_create`

### interview keeps its question floors and adversarial review [~]

  - [~] **Draft**: MANUAL: the skill still asks up to the floor, and still runs the adversarial spec review before finishing

### unconfirmed answers become open questions [~]

  - [~] **Draft**: MANUAL: the generated DoD's `open_questions` field names that answer, and no requirement or scenario is written for it

### questions carry a risk label and a per-round cap [~]

  - [~] **Draft**: MANUAL: the skill asks at most 3 of them, each labeled Low, Medium or High, and defers the rest to a later round

### handoff names opsx:apply as an executor [~]

  - [~] **Draft**: MANUAL: the table includes `/opsx:apply` as one of the listed executors

### steps derive from the DoD as a schema artifact [~]

  - [ ] Proof: `openspec status --json` -> `openspec status --json` reports the `steps` artifact blocked with `dod` in its `missingDeps` <!--p:{"type":"exit_code","value":0}-->
  - [~] **Draft**: MANUAL: the generated `steps.json` contains one step whose `verify_cmd` is that proof command and whose title is the leaf's intent

### draft leaves map to manual_required steps [~]

  - [~] **Draft**: MANUAL: the generated `steps.json` contains a matching step with `manual_required: true`

### briefing carries the Requirement field [~]

  - [~] **Draft**: MANUAL: the briefing contains a `Requirement` field with the source scenario's `WHEN` and `THEN` text unchanged

### briefing states the assumption rule [~]

  - [~] **Draft**: MANUAL: the briefing text states the `ASSUMPTION:` comment rule

### staleness check reads openspec status [ ]

  - [ ] Proof: `openspec status --json` -> the staleness check detects the change through `openspec status --json`, not through a file mtime comparison <!--p:{"type":"exit_code","value":0}-->

### opsx:propose is a recognized plan producer [~]

  - [~] **Draft**: MANUAL: the skill recognizes it as a valid plan producer without error

### commit lands after each verified step [~]

  - [~] **Draft**: MANUAL: the orchestrator commits that step's changes before dispatching the next step

### finishing traces and archives [ ]

  - [ ] Proof: `dod-guard trace` -> Finishing runs `dod-guard trace` and, when it exits zero, runs `openspec archive <id> --yes` <!--p:{"type":"exit_code","value":0}-->

### cheap-step mirrors step-by-step [ ]

  - [ ] Proof: `dod-guard trace` -> it runs `dod-guard trace` and `openspec archive <id> --yes` the same way, and its briefing still carries a `mode` field <!--p:{"type":"exit_code","value":0}-->

### adversarial review reads the spec [~]

  - [~] **Draft**: MANUAL: its input includes the spec delta text for the requirement the step under review claims to satisfy

### DoD artifact in the schema [ ]

  - [ ] Proof: `openspec status --json` -> `openspec status --json` reports the `dod` artifact as not blocked <!--p:{"type":"exit_code","value":0}-->
  - [ ] Proof: `openspec status --json` -> `openspec status --json` reports the `dod` artifact blocked with `specs` in its `missingDeps` <!--p:{"type":"exit_code","value":0}-->

### DoD generated from spec deltas [~]

  - [~] **Draft**: MANUAL: the generated DoD contains one leaf under that requirement's heading, with the scenario's `THEN` line as the leaf intent
  - [~] **Draft**: MANUAL: the generated DoD groups both leaves under that one requirement heading

### Uncheckable scenario becomes a draft leaf [~]

  - [~] **Draft**: MANUAL: the generated DoD marks that leaf as a draft with a `MANUAL:` intent, and the leaf's verdict is INCOMPLETE

### Generated DoD registers through dod_import [~]

  - [~] **Draft**: MANUAL: it reports the same leaf count as scenarios and drafts in the spec deltas that produced it

### Regenerated DoD preserves the tamper fingerprint [~]

  - [~] **Draft**: MANUAL: regenerating and re-importing the DoD updates only the leaves tied to the changed scenario, and leaves the fingerprint on every untouched leaf intact

### trace command exists [~]

  - [~] **Draft**: MANUAL: the command exits without a usage error and prints a report

### Untraced leaf fails the check [ ]

  - [ ] Proof: `dod-guard trace` -> `dod-guard trace` reports that leaf as untraced and exits non-zero <!--p:{"type":"exit_code","value":0}-->

### Untraced scenario is reported, not blocking [ ]

  - [ ] Proof: `dod-guard trace` -> `dod-guard trace` names that scenario in its report and, absent any untraced leaf, exits zero <!--p:{"type":"exit_code","value":0}-->

### trace is wired into the CI gate table [ ]

  - [ ] Proof: `dod-guard trace` -> it names `dod-guard trace` and states that an untraced leaf fails the gate <!--p:{"type":"exit_code","value":0}-->

</definition_of_done>
