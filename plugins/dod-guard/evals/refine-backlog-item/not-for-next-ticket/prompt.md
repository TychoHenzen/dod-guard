---
name: refine-backlog-item--not-for-next-ticket
description: Implementing an already refined PBI belongs to next-ticket.
tags: [refine-backlog-item, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Issue #204 is already refined and in Todo. Implement it now.
