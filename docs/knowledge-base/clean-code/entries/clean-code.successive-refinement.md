---
key: clean-code.successive-refinement
title: Successive Refinement
chapter: clean-code
section: clean-code.successive-refinement
summary: Start with a working design, then refine it through tests, clearer boundaries, and deliberate deletion.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 14, printed pages 194-251 (PDF pages 225-282)
    project: clean-code
    language: English
related_keys: []
---

Treat a working first design as a starting point, not a permanent shape. Keep a fast, meaningful test suite around the behavior, then improve the design in small steps so every refinement has a clear safety check. The goal is not to predict every future requirement; it is to keep the code easy to change as understanding improves.

Refine by separating concerns that have become visible. Give parsing, validation, error reporting, and domain decisions names and boundaries that let a reader follow the main path without reconstructing hidden state. Extract cohesive operations, move a responsibility to the class that owns the relevant data, and keep each intermediate change understandable.

After each refactoring, run the tests and remove the structures that the new design no longer needs. Deleting duplicate maps, dead seams, and obsolete forwarding code is often the cleanest improvement. A long case study can become simpler through many small extractions, clearer names, and moving cohesive types rather than one heroic rewrite.

Successive refinement is disciplined feedback, not endless motion. Preserve behavior while improving intent, stop when the design is clear enough for the current stories, and let tests expose when a proposed cleanup changes the contract. Keep the result proportionate: use the smallest boundary that clarifies ownership without inventing ceremony for its own sake.
