---
name: complete-pr--merge-green
description: An approved, green PR should be merged.
tags: [complete-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

PR #77 is approved and CI is green. Merge it.
