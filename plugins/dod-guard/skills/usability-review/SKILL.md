---
name: usability-review
description: Review a user-facing interface or workflow for usability, accessibility, and AI trust cues using the evidence that exists. Use during feature planning, implementation, review, or handoff when the user's task, interaction path, or interface states need an evidence-backed critique.
---

# Usability review

Review whether a user can understand and complete the intended task. This is
a practical, evidence-aware review, not a visual design system or a formal
accessibility conformance audit.

## Shared working defaults

Read and apply `standards/working-defaults.md` from the plugin root.

## Establish the task

Read the feature request, PBI, acceptance criteria, and relevant repository
instructions. State:

- the intended user and their primary task;
- the expected successful outcome;
- the surface type: CLI, API, documentation flow, graphical interface, or
  another workflow;
- the evidence available and the evidence that cannot be observed.

Do not infer a visual surface, browser, design system, user goal, or product
requirement that the request and repository do not establish.

## Select evidence

Use the strongest available evidence for the surface:

- source, command help, API descriptions, configuration, and documentation for
  CLI, API, and non-visual workflows;
- screenshots or mockups for static visual review;
- live interaction for behavior, focus, responsive, loading, and recovery
  states when a live surface is available.

If a screenshot, mockup, or live surface is unavailable, record that limit and
review the evidence that exists. Do not claim that an unobserved state passes.
Do not require a browser, MCP server, external dependency, or provider-specific
UI tool.

## Review the task journey

Follow the user's task from start to finish. Check only the states and surfaces
that apply:

1. Discoverability: can the user find the feature and understand its purpose?
2. Hierarchy and wording: are labels, instructions, and choices clear?
3. Affordances and input burden: does the surface show what is actionable and
   request only the information needed?
4. Progress and empty states: does loading, waiting, or no-result state explain
   what is happening and what the user can do next?
5. Success and feedback: does completion show the result and the next useful
   action?
6. Error and recovery: does failure explain the problem, preserve safe state,
   and offer a correction, retry, undo, or support path?

## Review accessibility and interaction

For graphical or interactive surfaces, inspect applicable evidence for semantic
structure, accessible names and labels, keyboard operation, visible focus,
contrast, target size, responsive behavior, and reduced motion. Check these
only when the relevant surface and evidence exist. For CLI, API, and
documentation workflows, review equivalent clarity and operability without
applying visual checks that do not fit.

When the feature uses AI, also check for applicable trust cues: consent,
disclosure, cost, uncertainty, verification, undo, and control over generated
changes or external actions.

Keep heuristic findings separate from formal standards claims. This skill does
not establish WCAG conformance or replace product research, security,
performance, or functional testing.

## Report findings

Prioritize findings by user impact:

- `high`: blocks the primary task, hides a critical state, or creates a serious
  accessibility, trust, or recovery barrier;
- `medium`: causes substantial confusion, extra work, or an avoidable error;
- `low`: a smaller clarity or efficiency improvement.

Return a concise report with this shape:

```text
## Usability review
- Intended user and task: ...
- Surface: ...
- Evidence used: ...
- Evidence unavailable: ... or none

### Findings
- [high|medium|low] Short finding
  - Impact: ...
  - Evidence: path:line, heading, screenshot region, or observed state
  - Minimal change: ...
  - Verification: ...
```

Include the relevant user journey and state coverage even when no finding
exists. Mark unobserved evidence explicitly. Do not implement findings, impose
aesthetic preferences, invent a dependency, apply visual checks to a
non-visual surface, or claim formal WCAG conformance.

Run this skill explicitly or as a contextual review during planning,
implementation, review, or handoff. It has no automatic hook.
