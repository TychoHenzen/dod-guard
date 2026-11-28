---
name: complete-pr--not-for-submit-draft-pr
description: Opening a draft PR belongs to submit-draft-pr.
tags: [complete-pr, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Open a draft PR for the branch I just pushed. Don't merge anything yet.
