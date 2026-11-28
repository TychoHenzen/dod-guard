---
name: submit-draft-pr--ready-for-review
description: The user wants a PR up for review, without saying draft.
tags: [submit-draft-pr, should-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

The branch for #57 is pushed and the tests pass. Put up a pull request so it can get reviewed.
