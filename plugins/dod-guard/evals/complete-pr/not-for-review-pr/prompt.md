---
name: complete-pr--not-for-review-pr
description: Asking whether a PR is ready to merge is a review, not a merge.
tags: [complete-pr, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Review PR #64 and tell me whether it's ready to merge.
