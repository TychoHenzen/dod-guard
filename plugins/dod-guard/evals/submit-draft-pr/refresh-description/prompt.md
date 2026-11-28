---
name: submit-draft-pr--refresh-description
description: An existing draft PR needs fresh evidence after new commits.
tags: [submit-draft-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

I added two more commits to the branch for #57. Update its draft PR so the description and verification evidence match the new head.
