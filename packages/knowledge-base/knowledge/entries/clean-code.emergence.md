---
key: clean-code.emergence
title: Emergence
chapter: clean-code
section: clean-code.emergence
summary: Let passing tests, less duplication, clear intent, and pragmatic size guide incremental design.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 12, printed pages 172-177 (PDF pages 203-208)
    project: clean-code
    language: English
related_keys: []
---

Use a small set of design priorities in order. First make the system pass all of its tests so behavior is verifiable; then remove duplication, make the code express its intent, and keep the number of classes and methods pragmatic. The later rules do not excuse skipping the earlier ones.

Tests are design feedback, not only a final check. A testable boundary encourages small responsibilities, low coupling, dependency inversion, and collaborators that can be substituted. After each small change, run the tests and use the safety they provide to refactor the design rather than preserving a working mess.

Treat duplication as extra risk and complexity, including duplicated decisions or implementations that can be expressed through one shared operation. Refactor common behavior at the smallest useful boundary, but move it to a clearer owner when the extraction exposes a separate responsibility. Good names, small focused functions, standard design vocabulary, and tests that read like examples make intent easier for the next maintainer to recover.

Keep class and method counts low enough to avoid pointless ceremony. Do not create an interface for every class or split data and behavior by dogma; a pragmatic compact design is preferable. Size is the lowest-priority rule, so it must not override passing tests, removing duplication, or expressing the design clearly.
