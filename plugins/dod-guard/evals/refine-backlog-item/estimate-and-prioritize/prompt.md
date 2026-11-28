---
name: refine-backlog-item--estimate-and-prioritize
description: The user asks for effort and priority without saying refine.
tags: [refine-backlog-item, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Can you estimate #88 and give it a priority? It's still sitting in Backlog.
