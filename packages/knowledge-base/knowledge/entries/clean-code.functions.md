---
key: clean-code.functions
title: Functions
chapter: clean-code
section: clean-code.functions
summary: Compose small, focused functions whose names and boundaries make the system's story readable.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 3, printed pages 31-52 (PDF pages 62-83)
    project: clean-code
    language: English
related_keys: []
history: []
---

Functions are the first useful units of organization in a program, so a good one keeps its purpose visible. Keep a function small enough to understand, let it operate at one level of abstraction, and choose a name that explains the work rather than forcing the reader to reconstruct it from control flow.

Arguments and side effects are part of the cost of a function's interface. Fewer arguments make calls easier to read, while hidden state changes create lies and order dependencies. Separate commands from queries when a call both changes state and answers a question, and use exceptions to keep error handling from turning normal control flow into nested code tables.

Readable functions fit together as a short story: each operation has one clear responsibility, duplicated mechanics are extracted once, and the caller can follow the sequence without jumping between unrelated abstraction levels. The goal is not a mechanical line-count rule; it is a composition whose names, boundaries, and behavior make change safe.
