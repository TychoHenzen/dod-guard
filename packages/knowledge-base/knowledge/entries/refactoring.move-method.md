---
key: refactoring.move-method
title: Move Method
chapter: refactoring
section: refactoring.method-movement
summary: Move behavior to the type that owns the data and rules it uses most.
project: dod-guard
language: TypeScript
sources:
  - label: dod-guard refactoring notes
    project: dod-guard
    language: TypeScript
    url: https://github.com/TychoHenzen/dod-guard
related_keys: []
---

When a method depends mainly on another type, move it with the smallest caller update that preserves the public behavior. Check the old callers and tests before deleting the old location.
