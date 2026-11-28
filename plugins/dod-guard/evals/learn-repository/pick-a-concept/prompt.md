---
name: learn-repository--pick-a-concept
description: The user asks to learn one concept from source and choose the next.
tags: [learn-repository, should-trigger, tail]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Help me actually learn this repo. Pick one core concept, explain it from the source, and let me choose what comes next.
