---
name: next-ticket--not-for-goal-sdlc
description: Draining the whole queue belongs to goal-sdlc.
tags: [next-ticket, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Work through everything in the project's Todo column, one item after another, until the queue is empty. Don't stop between items.
