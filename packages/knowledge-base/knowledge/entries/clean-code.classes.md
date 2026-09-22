---
key: clean-code.classes
title: Classes
chapter: clean-code
section: clean-code.classes
summary: Keep classes small, cohesive, and focused on one reason to change.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 10, printed pages 135-151 (PDF pages 166-182)
    project: clean-code
    language: English
related_keys: []
---

Organize a class so a reader can find its state, public behavior, and private support without crossing unrelated concerns. Small size helps, but the more useful test is responsibility: a class should have one coherent reason to change and should not make callers understand a collection of unrelated mechanisms.

Keep the class cohesive. Its methods should use most of its state together, and a class that repeatedly carries unused fields or splits its data across unrelated operations is asking for a smaller set of collaborators. Several small classes are often easier to understand and change than one class that owns every nearby decision.

Organize for change by isolating volatile policies behind narrow interfaces and keeping common private behavior in the class that owns it. Depend on abstractions where substitution or testing needs it, and pass collaborators into the class rather than constructing a web of concrete dependencies inside it.

A class boundary is useful when it reduces the amount of code a reader must hold in mind and limits the blast radius of a change. Do not split classes for a numeric size target alone; split when responsibilities, cohesion, or change reasons show that the boundary would clarify ownership.
