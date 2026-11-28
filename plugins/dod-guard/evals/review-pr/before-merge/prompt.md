---
name: review-pr--before-merge
description: A critical look at a PR before merging, without the word review.
tags: [review-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Take a critical look at pull request 64 and tell me what needs to change before it can merge.
