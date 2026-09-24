---
key: clean-code.formatting
title: Formatting
chapter: clean-code
section: clean-code.formatting
summary: Format code as a readable communication surface with consistent structure, spacing, and ordering.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 5, printed pages 75-92 (PDF pages 106-123)
    project: clean-code
    language: English
related_keys: []
---

Formatting is communication, not decoration. Agree on simple team rules and apply them consistently so a reader can see the module's shape before studying its details. Keep files small enough to scan, put the headline concepts first, and let detail increase as the reader moves downward.

Use vertical space to separate independent thoughts and keep closely related declarations, functions, and concepts dense. Keep variables near their use, instance fields in a predictable place, and callers above the functions they call when that ordering makes the source read from high level to low level. Strong conceptual affinity is a reason to keep related code together rather than making readers hunt across a file.

Keep lines reasonably short, use horizontal whitespace to show grouping and operator precedence, and avoid alignment that hides the assignment or type that matters. Indentation should reveal the hierarchy of scopes at a glance. The exact style can vary, but a consistent, automated format should make the code's structure easy to read.
