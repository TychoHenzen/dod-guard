---
name: wiring-audit--retry-option
description: Audit whether an option is wired to a user-facing surface.
tags: [wiring-audit, should-trigger, tail]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Audit whether the new retry option is wired to anything user-facing.
