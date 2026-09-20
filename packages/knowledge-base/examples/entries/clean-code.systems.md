---
key: clean-code.systems
title: Systems
chapter: clean-code
section: clean-code.systems
summary: Keep system concerns modular, wire dependencies at the boundary, and defer decisions until evidence improves.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 11, printed pages 153-170 (PDF pages 184-201)
    project: clean-code
    language: English
related_keys: []
history: []
---

Keep a system understandable at the system level by separating concerns and giving each domain a clear boundary. Like a city, a software system needs useful abstractions and modular responsibilities so one team or component can work without carrying every detail of the whole.

Separate construction from use. Startup code should build and wire the major objects, while application code receives the collaborators it needs and focuses on runtime behavior. A main module, factory, or dependency-injection boundary can own construction without making the domain depend on concrete setup details.

Let the architecture grow with the stories the system must support. Keep domain logic in plain objects where possible, and add persistence, transactions, security, caching, or other cross-cutting concerns through boundaries that do not invade the core model. Test-drive the system architecture through those boundaries before committing to infrastructure, so the design stays testable and replaceable rather than coupled to a heavyweight framework.

Make decisions when the available evidence is strongest. Use standards when they add demonstrated value, not merely because they are fashionable, and use domain-specific languages or small fluent APIs when they make domain intent clearer. Modular concerns keep future choices local; the simplest system that can work is a better starting point than speculative infrastructure.
