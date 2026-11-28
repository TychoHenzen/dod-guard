---
name: teach-back--check-understanding
description: The user wants pushback questions on their own explanation.
tags: [teach-back, should-trigger, tail]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Agent, TaskStop, PowerShell]
---

I want to test my own understanding. I'll explain the release flow, and you push back with short questions.
