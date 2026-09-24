---
key: clean-code.boundaries
title: Boundaries
chapter: clean-code
section: clean-code.boundaries
summary: Isolate changing external code behind owned boundaries and learn its behavior with focused tests.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 8, printed pages 113-120 (PDF pages 144-151)
    project: clean-code
    language: English
related_keys: []
---

Treat a third-party library or another team's service as a boundary you do not control. Keep vendor types and assumptions out of the rest of the application by translating them at one owned adapter or wrapper. The application then depends on a small vocabulary that can stay stable while the external package changes.

Learn the boundary before trusting it. Small learning tests record the behavior your code actually needs from a package, expose surprising defaults, and give upgrades a focused regression signal. These tests are not a replacement for your own domain tests; they pin the external contract at the edge.

When the other side of a boundary does not exist yet, design against the interface your code needs and keep the provisional adapter replaceable. The client can progress without guessing at a future implementation, while the boundary remains visible instead of leaking a guessed protocol into many callers.

Keep boundary code clean by limiting translation, ownership, and change to one place. A narrow interface, explicit tests, and a deliberate adapter make integration changes cheap to inspect and prevent third-party details from becoming accidental application architecture.
