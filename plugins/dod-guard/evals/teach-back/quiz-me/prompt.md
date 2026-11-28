---
name: teach-back--quiz-me
description: The user explains and wants a curious student to question them.
tags: [teach-back, should-trigger, tail]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

Let me explain how the plugin loader in this repo works, and you play a curious student who asks questions to check I've got it right.
