# <!-- change title --> — Requirements Spec

<claude_instructions>
**For the implementer:** Work through each task below.
1. Mark a task `[>]` when you begin working on it.
2. Call `dod_check` to verify proofs — do NOT mark proofs manually.
3. A task group is complete when ALL its concrete proofs pass via `dod_check`.
4. Use `dod_refine` to turn a draft leaf into a concrete proof or subdivide into child tasks.
5. If a proof cannot be met, use `dod_amend` to modify it with a reason.
6. Continue until `dod_check` returns PASS — then stop and report done.

**Behavioral predicates only.** Each proof is a concrete behavioral claim.
Read failure diagnoses carefully — they tell you WHAT went wrong and what to fix.
Proofs run on the HOST OS — write OS-correct commands (no bash on Windows).

**CWD:** `<!-- absolute path to the target repo -->`

**Anti-cheat:** Proofs stored canonically in MCP storage.
`dod_check` executes commands from the canonical copy, not this markdown file.
</claude_instructions>

**Goal:** <!-- one-sentence goal for this change -->

**Date:** <!-- YYYY-MM-DD -->
**Target:** `<!-- absolute path to the target repo -->`
**DoD ID:** `<!-- uuid assigned at import -->`

---

## Requirements

<requirements>
<!-- One line per capability this DoD covers, e.g.:
     - <capability-path>: <what the capability's spec delta requires> -->
</requirements>

---

## Definition of Done

<definition_of_done>

<!-- One root per changed capability. `<capability-path>` matches the spec
     delta's path under openspec/specs/. One leaf per scenario in that
     capability's delta - the converter turns each `#### Scenario:` into
     exactly one proof leaf here, so scenario count and leaf count under a
     root always match. -->
### <!-- capability-path --> [ ]

  - [ ] Proof: `<!-- verification command for this scenario -->` → <!-- scenario name: expected behavior --> <!--p:{"type":"exit_code","value":0}-->

</definition_of_done>
