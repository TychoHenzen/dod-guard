---
key: design-patterns.strategy
title: Strategy
chapter: design-patterns
section: design-patterns.behavioral
summary: Represent a replaceable behavior behind one small contract and choose it at the boundary.
project: spatial-wires
language: C#
sources:
  - label: spatial-wires architecture notes
    project: spatial-wires
    language: C#
    url: https://github.com/TychoHenzen/spatial-wires
related_keys: []
---

Use Strategy when behavior varies independently from the object that coordinates it. Keep the contract narrow so callers do not depend on implementation details.
