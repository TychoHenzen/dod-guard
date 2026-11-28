---
name: wiring-audit--reachable-feature
description: The user doubts a feature is reachable by users.
tags: [wiring-audit, should-trigger, tail]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

I built a new export feature but I'm not sure users can actually reach it. Check whether there's a command, doc, or UI path to it.
