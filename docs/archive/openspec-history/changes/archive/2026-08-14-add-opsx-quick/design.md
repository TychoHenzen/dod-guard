## Context

The full workflow requires the user to run `/opsx:propose`, wait, run `/opsx:apply` or `/dod-guard:step-by-step`, wait, then run `/opsx:archive`. Each is a separate invocation. `/opsx:quick` collapses this into a single invocation that does enough documentation to keep traceability without blocking the user.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One skill file that runs clarification, change creation, steps generation, and step-by-step handoff in sequence
- Adaptive artifact depth: small changes get less ceremony, larger changes get more
- The OpenSpec change is still archivable and its spec deltas are still syncable

**Non-Goals:**
- No bypass of the OpenSpec change structure - there is always a change, always a proposal, always tasks
- No bypass of the step-by-step execution pipeline - implementation still goes through workers
- No new compiled code

## Decisions

### Size assessment uses file count and capability count, not lines of code

The skill decides artifact depth by counting the files and capabilities the change touches, not by estimating lines of code. File count is observable before implementation starts. Lines of code are not.

### Skip-specs for small changes, not no-change

A small change sets `skip_specs: true` in `.openspec.yaml` rather than creating empty specs. This is the OpenSpec-sanctioned way to say "this change has no spec-level behavior change." `openspec validate` accepts it. The retroactive-spec question after implementation catches the case where the user underestimated the scope.

### The skill invokes step-by-step rather than implementing inline

Even in the quick path, implementation goes through `/dod-guard:step-by-step`. The workers handle verification, the orchestrator commits per step, and the coverage gate runs before archive. The quick path saves time on planning, not on execution.

## Risks / Trade-offs

[Size assessment is heuristic] -> The file-count threshold (1-3 files = small) is a guess. A 1-file change can be architecturally significant. The retroactive-spec question is the safety net: if the implementation introduced behavior the specs should capture, the user decides.

[Single-flow invocation may hit context limits] -> A change with 8+ steps runs the entire step-by-step pipeline inside one skill invocation. For very large changes, the user should use `/opsx:propose` and `/opsx:apply` separately. The skill should warn when the task count exceeds 8.
