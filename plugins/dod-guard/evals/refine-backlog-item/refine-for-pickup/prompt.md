---
name: refine-backlog-item--refine-for-pickup
description: The user asks to refine a backlog item.
tags: [refine-backlog-item, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Refine #204 so it's ready to be picked up.
