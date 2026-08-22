---
name: spec-extract
description: >-
  Extract an exhaustive OpenSpec-format behavioral spec from a code or prose
  target by dispatching the appropriate contract-extractor agent. Works on any
  language: TypeScript, C#, C++, Rust, HTML, Python, or anything else with a
  recognized file extension. Writes the result as a spec file the caller or
  another skill can consume. TRIGGER when: user says "extract a spec from this
  file", "what does this module do", "spec out this target", "get me the
  contract for X", or a workflow needs a behavioral spec without deleting the
  original. DO NOT TRIGGER for a full blind rewrite (that is /blind-rewrite),
  ordinary code review, or writing a spec from scratch without a target.
---

# Spec Extract

Read a code or prose target and produce an OpenSpec-format behavioral spec
from it. The target stays unchanged. The spec file lands at a caller-specified
path or at `.spec-extract/<target-stem>.spec.md` beside the target.

## Agent dispatch compatibility

### Codex lifecycle

Before a Codex dispatch, inspect the active agent list. Reuse a related agent when practical.

Limit each parallel wave to the free agent slots. Wait for the wave, record every result, then close completed agents with the runtime's close action when available. If only interruption is available, interrupt agents whose work is no longer needed.

Do not assume a returned result freed a slot. If capacity is full, release unneeded agents and retry once. If closure is unavailable, reuse an existing agent through a follow-up instead of spawning another.

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

## Target classification

Classify the target as code or prose before dispatching an agent.

Code targets have a file extension associated with a programming language
(`.ts`, `.js`, `.cs`, `.cpp`, `.rs`, `.py`, `.java`, `.go`, `.rb`, `.swift`,
`.kt`, `.html`, `.css`, `.scss`, `.sql`, `.sh`, `.ps1`, `.lua`, `.zig`,
`.asm`, `.c`, `.h`) or a shebang line (`#!/`). All other targets are prose.

## Agent dispatch

For code targets, dispatch `dod-guard:blind-contract-extractor`.
For prose targets, dispatch `dod-guard:blind-prose-contract-extractor`.

Pass the target path to the agent. The agent reads the target, its call sites,
and its surrounding context on its own.

## Output-format transform

Transform the agent's report into OpenSpec spec format.

### Code targets (shapes A, B, C from blind-rewrite)

Write a `## Purpose` section with a one-sentence summary of the target.

For each behavior the agent reported, write a `### Requirement: <name>` block.
Use an RFC 2119 keyword (MUST, SHALL, SHOULD, or MAY) in the requirement
sentence. For each testable case, write a `#### Scenario: <name>` block with
GIVEN, WHEN, THEN (and AND) bullet lines.

Each requirement carries the agent's tag: `REQUIRED` (cited proof from a test
or spec) or `OBSERVED` (implementation asserts it, no external proof).

Boundary signatures from the agent's report appear verbatim in the relevant
requirement block.

### Prose targets (shape D from blind-rewrite)

Write a `## Purpose` section summarizing the document's role.

For each claim the agent reported, write a `### Requirement: <name>` block.
Use the claim's strength word (always, usually, sometimes, never) in the
requirement sentence. For each testable case, write a `#### Scenario: <name>`
block.

Each claim carries the agent's tag: `REQUIRED` or `OBSERVED`.

Verbatim text the agent identified (quotations, proper names, defined terms)
goes into a `## Verbatim` section for overlap-gate exemption.

## Appendix sections

After the requirements, write three appendix sections. These are informational
and do not carry RFC 2119 keywords.

### Usage census

List every call site the agent found: the file, the function or location, and
which fields or return values the caller consumes. For prose, list every
document that references or links to the target.

### Leak list

List every copy of the target the agent found in build output, rendered docs,
snapshots, or generated files. Name the path of each copy. Common build
output directories: `dist/`, `bin/`, `target/`, `obj/`, `out/`, `build/`.

### Banned vocabulary

List interior identifiers and algorithm names that no caller outside the
module reaches. These names exist so a downstream workflow (like blind-rewrite)
can screen them out of a contract before an author sees them.

## File write

Write the finished spec to the caller's output path. When no output path was
given, write to `.spec-extract/<target-stem>.spec.md` beside the target file.
Create the `.spec-extract/` directory if it does not exist.

## OpenSpec merge (optional)

When this repo has an `openspec/` directory, check whether the target's
capability already has a spec: `openspec list --specs --json`. When a spec
exists, read it with `openspec show <name> --json --requirements`.

Merge the existing spec's `REQUIRED` claims into the output. Claims that
appear in both the existing spec and the agent's report keep the `REQUIRED`
tag. Claims the agent found that the existing spec does not mention keep
the `OBSERVED` tag.

## Guardrails

- The target file stays at its location, unchanged. Never delete, move, or
  quarantine it.
- The `.spec-extract/` directory is scratch output. It is already in
  `.gitignore`.
- Cap: 2 subagent dispatches per run (one extractor, one optional recheck).
