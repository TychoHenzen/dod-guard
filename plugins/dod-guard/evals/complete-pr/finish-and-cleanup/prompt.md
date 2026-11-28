---
name: complete-pr--finish-and-cleanup
description: The user asks to merge and delete the branch.
tags: [complete-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Finish off pull request #310: get it merged and delete the branch.
