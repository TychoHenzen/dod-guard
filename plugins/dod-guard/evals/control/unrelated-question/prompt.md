---
name: control--unrelated-question
description: A question unrelated to delivery must not start any busy workflow skill.
tags: [control, should-not-trigger, busy]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

What does the regular expression ^(a|b)*c$ match? Answer in two sentences.
