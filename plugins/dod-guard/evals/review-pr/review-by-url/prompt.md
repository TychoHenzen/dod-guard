---
name: review-pr--review-by-url
description: A PR given by URL, asked for a proper code review.
tags: [review-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Can you give https://github.com/acme/widgets/pull/12 a proper code review?
