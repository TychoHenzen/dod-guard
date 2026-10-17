---
name: usability-review
description: Review a user-facing interface or workflow for usability, accessibility, and AI trust cues using the evidence that exists. Use during feature planning, implementation, review, or handoff when the user's task, interaction path, or interface states need an evidence-backed critique.
---

# Usability review

Read and apply `standards/working-defaults.md` from the plugin root (stricter skill boundaries win).

## When it runs

This skill runs only when someone asks for it with `/usability-review`, or when another task calls for it explicitly or as a contextual review. Nothing triggers it automatically, and no hook does.

## What it will not do

- Do not implement findings. The output is a critique, and any change is a separate task.
- Do not require a browser, MCP server, external dependency, or provider-specific UI tool, and never invent a dependency.
- It is not a visual design system review or a formal accessibility conformance audit.
- Do not claim that an unobserved state passes. If you did not see it, say so.
- A usability review does not establish WCAG conformance. Heuristic findings stay separate from claims about a formal standard.
- It does not stand in for product research, security review, performance testing, or functional testing.
- It does not push your taste. Judge the interface by whether the user can finish the task, not by style.

## Settle the scope first

Before you judge anything, read the request, the PBI, the acceptance criteria, and the repository instructions. Then record four things:

1. The intended user and their primary task, plus the outcome they expect.
2. The surface type: CLI, API, docs, GUI, or other.
3. The evidence you have.
4. The evidence you do not have.

Take only what the request and the repository establish. Never infer a visual surface, a browser, a design system, a goal, or a requirement they leave out.

## Match the evidence to the surface

| Surface | Evidence to use |
|---|---|
| No visual layer | source, command help, API descriptions, configuration, and documentation |
| Static visual | screenshots or mockups |
| Running interface | live interaction: behavior, focus, responsive layout, loading, and recovery |

Use the live row only when something live exists. When a surface is missing, record that as a limit and review what remains. A gap in evidence is a result of the review, not a reason to stop.

## What to ask along the journey

Follow the user from first contact to finished task. Ask each question only for states that apply to this feature.

- Discoverability: Can the user find the feature, and do they see what it is for?
- Hierarchy and wording: Do the labels, instructions, and choices read clearly?
- Affordances and input burden: Is it obvious what can be acted on, and is the user asked only for input the task needs?
- Progress and empty states: When the interface is loading, waiting, or has nothing to show, does it say what is going on and what to do next?
- Success and feedback: After the task works, does the user see the result and a useful next step?
- Error and recovery: When something fails, does the interface explain the problem, leave the user in a safe state, and offer a way to correct, retry, undo, or get help?

## Accessibility

Apply these checks only to a graphical or interactive surface, and only with evidence in hand:

- semantic structure
- accessible names and labels
- keyboard operation
- visible focus
- contrast
- target size
- responsive behavior
- reduced motion

A CLI, an API, or a document gets the matching checks for clarity and operability. It gets none of the visual ones.

## AI trust cues

If the feature uses AI, check how it handles consent, disclosure, cost, uncertainty, verification, undo, and control over generated changes or external actions. If it does not use AI, leave this out.

## Severity scale

- high: the problem blocks the primary task, hides a critical state, or forms a serious accessibility, trust, or recovery barrier.
- medium: the problem causes substantial confusion, extra work, or an error the user could have avoided.
- low: a smaller gain in clarity or efficiency.

## Write the report

Keep it short and put the findings with the most user impact first. Show which parts of the journey and which states you covered, even when you found no problems. Flag anything you could not observe.

```text
## Usability review

Intended user and task: <who, and what they are trying to do>
Surface: <CLI | API | docs | GUI | other>
Evidence used: <what you read or saw>
Evidence unavailable: <what you could not observe, or none>

### Findings

- [high|medium|low] <short title>
  Impact: <what the user loses or risks>
  Evidence: <path:line, heading, screenshot region, or observed state>
  Minimal change: <the smallest change that removes the problem>
  Verification: <how to confirm the change worked>
```
