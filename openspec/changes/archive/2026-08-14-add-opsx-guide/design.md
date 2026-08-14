## Context

The guide skill is an interactive teacher, not a workflow executor. It reads the project's state to give grounded examples but never writes code or creates changes. It bridges the gap between "I installed this plugin" and "I know which skill to use."

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One SKILL.md that serves as the entry point for new users
- Uses the current project's real data for examples
- Maps any intent to the right skill in 1-2 turns

**Non-Goals:**
- Not a replacement for the skills it references - it teaches when to use them, not how they work internally
- Not a static FAQ - it reads the project state and adapts
- No compiled code

## Decisions

### Interactive Q&A via AskUserQuestion, not a wall of text

The skill presents options and responds to what the user picks rather than dumping a manual. AskUserQuestion with 3-4 options keeps each turn focused. The user drives the conversation.

Alternative: Print a structured reference card. Rejected because static text does not adapt to the user's context and they stop reading after the first screen.

### Examples come from the current project, not from templates

Running `openspec list --specs --json` and `dod-guard cover --all` gives the skill real spec names, scenario counts, and coverage outcomes to reference. This grounds the explanation in something the user can verify.

### The lifecycle diagram is ASCII, not a rendered image

The skill runs inside Claude Code where images are not rendered inline. ASCII art is visible everywhere. The diagram shows the phases, the skills at each phase, and the artifacts each produces.

## Risks / Trade-offs

[Guide depends on all other opsx skills existing] -> The guide references `/opsx:init`, `/opsx:dashboard`, `/opsx:propose`, `/opsx:quick`, `/opsx:apply`, etc. If any is missing, the guide sends the user to a dead end. This change should be implemented last, after the admin skills and the overrides ship.
