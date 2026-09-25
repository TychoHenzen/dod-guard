---
key: clean-code.comments
title: Comments
chapter: clean-code
section: clean-code.comments
summary: Prefer expressive code and keep necessary comments accurate, local, and purposeful.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 4, printed pages 53-74 (PDF pages 84-105)
    project: clean-code
    language: English
related_keys: []
---

Comments are a fallback for intent that the code cannot make clear on its own, not a substitute for readable names, focused functions, or clean structure. Try to express the reason and behavior in code first; a comment that merely repeats the next statement adds maintenance cost and can drift away from what the program actually does.

When a comment earns its place, keep it accurate and close to the code it explains. Legal notices, concise facts, design intent, clarifications for an unchangeable API, warnings about real consequences, and honest TODO notes can help a maintainer. The useful test is whether the comment gives context that the code cannot reasonably carry, rather than whether it fills space above a declaration.

Treat stale or misleading comments as defects. Avoid commented-out code, HTML-heavy documentation in source, nonlocal system facts, historical essays, unexplained constants, and headers for short private functions. Reserve Javadocs for public APIs rather than adding their formality to nonpublic code. A small comment budget and expressive code make the remaining guidance easier to trust.
