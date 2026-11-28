---
name: submit-draft-pr--open-draft
description: A pushed PBI branch needs its draft PR.
tags: [submit-draft-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

I've pushed codex/57-csv-export. Open the draft PR for it.
