---
name: submit-draft-pr--not-for-complete-pr
description: Marking ready and merging belongs to complete-pr.
tags: [submit-draft-pr, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Mark PR #77 ready for review and merge it once the required checks pass.
