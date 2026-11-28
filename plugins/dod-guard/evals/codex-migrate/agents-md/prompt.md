---
name: codex-migrate--agents-md
description: The user wants CLAUDE.md and AGENTS.md to share instructions.
tags: [codex-migrate, should-trigger, tail]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Can our CLAUDE.md and AGENTS.md share one set of instructions so Codex picks them up too?
