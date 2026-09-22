---
key: clean-code.error-handling
title: Error Handling
chapter: clean-code
section: clean-code.error-handling
summary: Use exceptions with useful context, keep normal flow clear, and avoid null-driven branching.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 7, printed pages 103-112 (PDF pages 134-143)
    project: clean-code
    language: English
related_keys: []
history: []
---

Use exceptions to separate failure reporting from the ordinary result path. Return codes make every caller remember to check a second result channel, and an unchecked code can turn a local failure into a distant one. Keep the exception message and type useful to the caller that must decide whether to recover, translate, or stop.

Shape the try-catch-finally boundary before filling in the algorithm. The boundary makes cleanup and exceptional behavior visible, and tests can establish the expected failure before the implementation settles. Catch failures at a level that can add context or choose a recovery action instead of catching everything where the original detail is still available.

Name exception classes around the needs of callers rather than the internal APIs that happen to throw them. A small wrapper around a third-party library can translate unstable vendor exceptions into the domain vocabulary used by the rest of the application while preserving the original cause for diagnosis.

Keep the normal flow readable. When an exceptional branch is actually an expected case, model that case explicitly so callers do not repeat null checks or bury the main operation in defensive nesting. Return empty or special-case objects when they represent a valid result, and reject null arguments at the boundary instead of allowing null to spread through unrelated code.
