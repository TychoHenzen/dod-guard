---
name: next-ticket--grab-top-todo
description: The user asks for one item from the queue, not the whole queue.
tags: [next-ticket, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Grab the top item from the Todo column and implement it.
