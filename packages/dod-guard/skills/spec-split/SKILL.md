---
name: spec-split
description: Walk compound requirements interactively, propose one scenario per uncovered obligation, re-assign test bindings after a split, and rewrite the spec file. Use when a requirement packs multiple RFC 2119 obligations into fewer scenarios than obligations.
argument-hint: <path-to-spec.md or spec-id>
---

# Spec split

You split compound requirements into one scenario per obligation.

A compound requirement has more RFC 2119 obligation keywords (SHALL,
MUST, SHOULD, MAY, REQUIRED, OPTIONAL, RECOMMENDED) in its body than
scenarios beneath it. Each uncovered obligation becomes a proposed
scenario.

## Input

The user provides a spec file path or a spec id (like
`dod-guard/step-by-step`). Resolve the id to
`openspec/specs/<group>/<capability>/spec.md`.

## Workflow

1. Run `analyzeSpec(specFilePath)` from
   `scripts/ci/lib/obligation-count.mjs` to find requirements with
   positive delta.
2. For each compound requirement (delta > 0), present the requirement
   text to the user and propose one new scenario per uncovered
   obligation. Each proposed scenario follows the WHEN/THEN format
   from the existing spec.
3. Wait for the user to confirm, edit, or reject each proposed
   scenario before writing anything. Use `AskUserQuestion` in Claude or `request_user_input` in
   Codex. If neither tool is available, end the turn with one concise question for the proposal.
   Wait for the answer.
4. After the user confirms a set of scenarios for a requirement,
   check whether the original compound scenario had a bound test. If
   so, read the test body, match assertions against the new
   sub-scenarios by keyword overlap, and suggest bindings. The user
   confirms or overrides each binding.
5. Write the confirmed scenarios into the spec file, preserving the
   existing format. Leave rejected scenarios out.
6. After all requirements are processed, print a summary: how many
   requirements were split, how many scenarios were added, how many
   bindings were reassigned.

## Constraints

- Never write a scenario the user has not confirmed.
- Never delete an existing scenario. Splitting adds sub-scenarios
  alongside the original, and the user decides whether to remove
  the original.
- One requirement at a time. Finish one before presenting the next.
- If the spec has no compound requirements, say so and stop.

## Test binding re-assignment

When a compound scenario bound to a test splits:

1. Run `dod-guard cover --all` to find the test file and function
   bound to the original scenario.
2. Read the test function body.
3. For each new sub-scenario, score keyword overlap between the
   sub-scenario's THEN clause and the test's assertions.
4. Propose binding the test to the sub-scenario with the highest
   overlap score. Sub-scenarios with no matching assertion stay
   unbound.
5. The user confirms each proposed binding. On confirmation, update
   the `covers:` marker in the test file.
