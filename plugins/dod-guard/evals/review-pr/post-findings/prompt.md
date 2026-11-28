---
name: review-pr--post-findings
description: The user asks for a posted PR review.
tags: [review-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Review PR #64 and post your findings on it.
