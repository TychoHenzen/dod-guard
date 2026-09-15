---
name: wiring-audit
description: Audit whether a feature can be found, invoked, used, and understood through the repository's real user-facing surfaces. Use during feature planning, implementation, or review when internal code may lack a command, configuration, documentation, example, API, or UI path.
---

# Wiring audit

Check whether the feature reaches its intended user. This is a completeness
audit, not an implementation task or a visual design review.

## Shared working defaults

Read and apply `standards/working-defaults.md` from the plugin root.

## Establish the boundary

Read the feature request, PBI, implementation notes, acceptance criteria, and
relevant repository instructions. State:

- the intended user;
- the user's primary task;
- whether the feature is user-facing, intentionally internal, or unclear.

Do not invent a user, task, interface, command, configuration shape, or
documentation structure. If the contract does not establish a user-facing
need, report the boundary as unverified. Treat intentionally internal behavior
as `not applicable` when repository evidence supports that decision.

## Trace the real path

Inspect the repository's source, callers, tests, configuration, help, examples,
documentation, and UI or API registrations. Select only the surfaces relevant
to the feature. Trace the path in this order:

1. Discovery: how the user finds the feature.
2. Setup: required installation, configuration, permissions, or prerequisites.
3. Entry point: the command, route, control, API, skill, or other invocation.
4. Inputs: accepted values, defaults, validation, and user-visible constraints.
5. Result: output, state change, success feedback, or next step.
6. Failure: error feedback, unavailable-state handling, and safe boundaries.
7. Recovery: retry, correction, undo, or a documented support path.

For a JSON-only or library-only implementation, do not treat an internal
serializer, return value, or passing unit test as a user path. Report the
missing discovery or entry surface when the contract requires one.

## Evaluate evidence

Classify each relevant surface as `verified`, `missing`, `contradicted`,
`unverified`, or `not applicable`. Mark a surface as required only when the
feature contract or repository evidence needs it. Keep optional polish separate
from required wiring. A missing optional example or cosmetic improvement is not
a completeness failure.

Use current repository evidence. Cite a precise path and line, heading,
symbol, route, command, or configuration key. When a required surface cannot
be inspected, say `unverified` and name the missing evidence. Do not turn an
absence of search results into proof until the relevant source and
documentation locations have been checked.

## Report findings

Return a concise audit with this shape:

```text
## Wiring audit
- Intended user and task: ...
- Boundary: user-facing, intentionally internal, or unclear
- Evidence limits: ... or none

### Findings
- [required|optional|unverified] [verified|missing|contradicted|unverified|not applicable]
  - Impact: ...
  - Evidence: path:line, heading, symbol, command, or state
  - Minimal next action: ...
  - Verification: ...
```

Report verified coverage for the entry point, setup, inputs, result, failure,
and recovery path. Report a missing or contradicted required surface with the
smallest next implementation or documentation action. Do not implement the
finding, claim user-facing completeness from internal code alone, or claim a
formal accessibility, security, performance, or standards result.

Run this skill explicitly or as a contextual check during planning, before
implementation, and before review or handoff. It has no automatic hook and
does not replace functional, security, performance, visual, or accessibility
review.
