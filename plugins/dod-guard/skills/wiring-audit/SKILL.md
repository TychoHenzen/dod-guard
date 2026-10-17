---
name: wiring-audit
description: Audit whether a feature can be found, invoked, used, and understood through real user-facing surfaces. Use during planning, implementation, or review when internal code may lack a command, config, doc, example, API, or UI path.
---

# Wiring audit

Read and apply `standards/working-defaults.md` from the plugin root (stricter skill boundaries win).

Use `/wiring-audit` to check that work a person is meant to use can actually be reached and used. Code that exists but has no way in is not finished. Nothing triggers this skill on its own. Run it
explicitly or as a contextual check during planning, before implementation, and before review or handoff.

## Establish the boundary

Read the request, the PBI, any notes, the acceptance criteria, and the repository instructions. Then state three things:

- the intended user,
- that user's primary task,
- whether the feature is user-facing, internal, or unclear.

If the documents do not establish a user-facing need, mark the boundary `unverified`. Do not invent a user, task, interface, command, or flow to fill the gap. When repo evidence shows the behavior is intentionally internal behavior, mark it `not applicable`.

## Trace the path

Follow the intended user through each stage in this order:

1. Discovery: how the user learns the feature exists.
2. Setup: what the user installs, configures, or enables first.
3. Entry point: the command, route, screen, API, or call the user starts from.
4. Inputs: what the user supplies and how they know what to supply.
5. Result: what the user sees or receives, and how they know it worked.
6. Failure: what happens when input or state is wrong, and whether the message helps.
7. Recovery: how the user gets back to a working state.

A JSON-only or library-only implementation does not meet this bar by itself. An internal serializer, a return value, or a passing unit test is never a user path. Do not claim user-facing completeness from internal code alone.

## Judge each surface

Mark a surface required only when the contract or repo evidence needs it. Optional polish stays separate, and a missing optional example is not a failure.

Classify each relevant surface as `verified`, `missing`, `contradicted`, `unverified`, or `not applicable`. Give every surface exactly one status.

Cite evidence with a precise path and line, heading, symbol, route, command, or configuration key. A vague pointer such as "the docs" does not count.

If a required surface cannot be inspected, mark it `unverified` and name the evidence you lack. An empty search proves nothing until you have checked both the source and the documentation locations.

## Report

Tag each finding as required, optional, or unverified. Report the verified coverage for each stage of the path.

Every finding carries three fields: `Evidence limits:` for what you could not check, `Minimal next action:` for the smallest change that closes the gap, and `Verification:` for how to confirm the change worked. Do not implement the finding. Hand it back and stop.

Use this shape:

```text
## Wiring audit
Intended user and task:
Boundary:

### Findings
- [required|optional|unverified] <surface> - <status>
  Impact:
  Evidence:
  Evidence limits:
  Minimal next action:
  Verification:
```

## Limits

This audit does not replace functional, security, performance, visual, or accessibility review. Do not report a formal accessibility, security, or performance result from it.
