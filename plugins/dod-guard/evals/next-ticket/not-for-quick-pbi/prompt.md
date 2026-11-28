---
name: next-ticket--not-for-quick-pbi
description: An end-to-end request from a raw idea belongs to quick-pbi.
tags: [next-ticket, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

I want a CSV export button on the reports page. Handle all of it: file the issue, build it, open the PR, get it reviewed, and merge it.
