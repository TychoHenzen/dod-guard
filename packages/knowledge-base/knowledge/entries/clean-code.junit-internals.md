---
key: clean-code.junit-internals
title: JUnit Internals
chapter: clean-code
section: clean-code.junit-internals
summary: Let expressive tests describe behavior while small refactorings make the implementation clearer.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 15, printed pages 252-267 (PDF pages 283-298)
    project: clean-code
    language: English
related_keys: []
---

Use tests as documentation by example. A good test suite states the behavior and edge cases of a module more clearly than a prose explanation, while coverage and repeated execution provide confidence that a cleanup has not changed the contract.

Refactor a working module in small, test-backed steps. Replace encoded scope prefixes and ambiguous names with names that expose intent, turn compound predicates into named decisions, and separate analysis from result formatting. Keep related operations together and order definitions so a reader can follow the main path without unnecessary jumps.

Expose temporal dependencies and hidden coupling instead of relying on call order that only the current implementation understands. Pass required state explicitly when that clarifies the relationship, combine operations when the combined boundary expresses their dependency, and undo an extraction when the resulting abstraction is less clear.

Delete dead conditionals, obsolete fields, and forwarding structures once tests show they are unnecessary. Refactoring is iterative trial and error: leave the module clearer than you found it, but keep every change proportional to the behavior and evidence the tests actually cover.
