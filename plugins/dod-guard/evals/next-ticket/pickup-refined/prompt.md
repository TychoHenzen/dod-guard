---
name: next-ticket--pickup-refined
description: A refined PBI is in Todo and the user asks to start it.
tags: [next-ticket, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Issue #42 is refined and sitting in Todo. Pick it up and start working on it.
