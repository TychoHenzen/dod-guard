---
key: clean-code.meaningful-names
title: Meaningful Names
chapter: clean-code
section: clean-code.meaningful-names
summary: Choose names that reveal intent, context, and the concept's role in changeable code.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 2, printed pages 17-30 (PDF pages 48-61)
    project: clean-code
    language: English
related_keys: []
---

A useful name answers why a value exists, what it represents, and how it is used. Prefer words that expose intent over abbreviations or encodings, and choose names that remain pronounceable and searchable so the team can discuss the code without translating private shorthand.

Consistency matters at the level of concepts, not just spelling. Use one vocabulary for one operation, avoid names that differ only by a small visual detail, and do not make a reader guess whether two similar terms mean the same thing. A name should carry enough context to stand on its own, but not so much that it repeats a scope or type that already makes the meaning obvious.

Good naming is a change aid rather than a decoration. Class names describe things, method names describe actions, and a focused scope lets a short name stay precise. When a name cannot say what the code means, improve the surrounding design or context instead of hiding the uncertainty in a comment.
