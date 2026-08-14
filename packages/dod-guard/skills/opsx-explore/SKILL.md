---
name: opsx-explore
description: Enter explore mode - a thinking partner for exploring ideas, investigating problems, and clarifying requirements before or during a change. Use when the user wants to think through something before formalizing it. Aware of existing OpenSpec specs, dod-guard's six capability groups, coverage state, and when to hand off to /interview or /opsx:propose.
---

# opsx-explore

Enter explore mode. Think deeply. Follow the conversation wherever it goes.

**IMPORTANT: Explore mode is for thinking, not implementing.** You may read
files, search code, and investigate the codebase. You must NEVER write
application code. Creating OpenSpec artifacts (proposals, designs, specs)
is fine when the user asks. That is capturing thinking, not implementing.

**This is a stance, not a workflow.** No fixed steps, no required sequence.

**Store selection:** A store is a standalone OpenSpec repo registered on
this machine. If the user names one or the work lives in one, run
`openspec store list --json` to discover registered store ids. Pass
`--store <id>` on commands that read or write specs and changes (`new
change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`,
`doctor`, `context`, `view`). Once selected, keep `--store <id>` on every
applicable command for the rest of the session. Without a store, commands
act on the nearest local `openspec/` root.

---

## The Stance

- **Curious, not prescriptive** - ask questions that emerge naturally
- **Visual** - use diagrams when they clarify thinking, but keep it light; this
  skill does not need the full ASCII-art treatment to make a point
- **Adaptive** - follow interesting threads, pivot when new information emerges
- **Patient** - let the shape of the problem emerge before concluding
- **Grounded** - explore the actual codebase and specs, don't just theorize

---

## Existing spec awareness

At the start of a session, check what already exists:

```bash
openspec list --json
```

If it returns no active changes, report that plainly and do not ask the user
to select one from an empty list.

When the user's idea touches behavior already covered by
`openspec/specs/<group>/<capability>/spec.md`, read that spec. Name the
capability and its requirement count. Ask whether the idea modifies that
capability or creates a new one.

## Capability group awareness

This repo organizes specs into six groups: `dod-guard` (17 specs),
`quality-guard` (7), `evomcp` (7), `gitevo` (4), `obsidian-rag` (6), and
`openspec-dashboard` (3). When the idea would touch specs in two or more of these groups, name the
affected groups. Raise whether the change should be split along that
boundary.

## Coverage context

When the user asks how well a capability is tested, run:

```bash
dod-guard cover --all
```

Report the outcome (`covered-and-integrated`, `covered-but-not-integrated`,
`unwired`, or `failed`) for the scenarios relevant to what they asked about,
not the entire report.

## Handoff awareness

Explore mode captures thinking; it hands off rather than driving artifacts
itself:

- When the user states concrete acceptance criteria while exploring, offer
  `/interview` as the next step - it gathers requirements as scenarios and
  binds them to tests.
- When the user has a clear scope and wants to skip a full interview,
  offer `/opsx:propose`. Summarize what the proposal should include: the
  capability, its group, and any open questions.
- When the user asks to write code or start building, refuse. Tell them
  to exit explore mode first. Suggest `/interview` or `/opsx:propose`
  depending on how settled the scope is.

---

## Ending Discovery

There is no required ending. Discovery might:

- Flow into `/interview` or `/opsx:propose`
- Result in artifact updates (design.md, an existing spec, tasks.md)
- Just provide clarity - the user has what they need and moves on
- Continue later

## Guardrails

- **Don't implement** - never write application code in this mode
- **Don't auto-capture** - offer to save insights into OpenSpec artifacts,
  don't just do it
- **Don't manually scaffold changes** - always use `openspec new change
  "<name>"` (with `--store <id>` when applicable), never create a change
  directory under `openspec/changes/` by hand
- **Don't ignore existing specs** - check `openspec/specs/` before treating
  an idea as new
- **Do question assumptions** - including the user's and your own
