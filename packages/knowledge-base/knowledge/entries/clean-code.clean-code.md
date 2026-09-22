---
key: clean-code.clean-code
title: Clean Code
chapter: clean-code
section: clean-code.foundation
summary: Keep code readable, focused, simple, and cared for so change stays possible.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 1, printed pages 1-16 (PDF pages 33-47)
    project: clean-code
    language: English
related_keys: []
history: []
---

Code is the executable detail of a requirement, so higher-level models do not remove the need to keep the implementation understandable. A growing mess makes even small changes expensive because each edit requires more local archaeology and creates more opportunities to break unrelated behavior.

Clean code is focused, readable, simple, and cared for. It does one thing clearly, keeps its intent visible, handles details rather than hiding them, and leaves the next reader with no obvious cleanup debt. Readability is practical speed: code is read far more often than it is written, so making the surrounding code easy to read makes later changes easier to make.

The Boy Scout rule is the maintenance habit that keeps this possible: leave the code a little cleaner than you found it. The rule is bounded cleanup, not an excuse for an unrelated rewrite; improve the nearby clarity while preserving behavior and keep larger changes explicit.
