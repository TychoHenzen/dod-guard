---
name: review-pr--not-for-fix-pr-review
description: Fixing named review findings belongs to fix-pr-review.
tags: [review-pr, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Fix findings GH-3 and GH-5 from the review on PR #88.
