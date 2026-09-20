---
key: clean-code.unit-tests
title: Unit Tests
chapter: clean-code
section: clean-code.unit-tests
summary: Keep tests readable, focused, and reliable so they explain behavior instead of hiding it.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 9, printed pages 121-133 (PDF pages 152-164)
    project: clean-code
    language: English
related_keys: []
history: []
---

Tests are code and need the same care as production code. Give each test a clear structure, use data that exposes the behavior under examination, and remove setup that does not help a reader understand the result. A readable test is a small explanation of the contract, not a pile of incidental plumbing.

Keep each test focused on one concept. One-assert guidance is useful when it keeps failures local and names one behavior, but a small group of assertions can still be right when they describe one coherent rule. The important boundary is that a test should not mix unrelated reasons to fail.

Tests should be F.I.R.S.T.: fast enough to run often, independent of other tests and their order, repeatable in every supported environment, self-validating with an unambiguous pass or failure, and timely enough to be written with the production behavior they protect. A slow, stateful, or ambiguous test suite stops being a safety net.

Treat test fixtures and helper APIs as part of the test's design. Prefer expressive builders and domain terms over duplicated setup, keep the test data close to the behavior it explains, and refactor tests when the production design changes. Clean tests preserve feedback instead of becoming another system that must be feared.
