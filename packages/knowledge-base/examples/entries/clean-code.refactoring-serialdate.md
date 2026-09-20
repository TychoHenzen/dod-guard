---
key: clean-code.refactoring-serialdate
title: Refactoring SerialDate
chapter: clean-code
section: clean-code.refactoring-serialdate
summary: Keep tests green while refactoring toward clear ownership, names, and smaller code.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 16, printed pages 268-285 (PDF pages 299-316)
    project: clean-code
    language: English
related_keys: []
history: []
---

Treat code review as professional learning rather than an attack. Start from the behavior the tests describe, make the failing or missing behavior work, and use the review to expose defects and unclear decisions without turning criticism into a judgment about the author.

Make the first pass work before making it elegant. Add or repair tests for boundary cases, run the whole suite, and resolve the behavior that the tests reveal. A commented-out test can record an unresolved question, but it is not evidence that a requirement should be silently ignored.

Once the suite is green, improve the design in small steps and run it again after each step. Move data and behavior to the abstraction that owns them, replace ambiguous integers with named types, remove flag arguments, clarify names, split responsibilities, and delete helpers, constants, and comments that no longer carry their weight. Prefer a smaller, clearer model over preserving structure merely because it already exists.

Coverage can shift when a class shrinks; the useful result is clearer code with the tested behavior intact, not a number defended at any cost. Finish by applying the Boy Scout Rule: leave the code easier for the next reader to understand than it was when you arrived.
