---
key: clean-code.objects-data-structures
title: Objects and Data Structures
chapter: clean-code
section: clean-code.objects-data-structures
summary: Choose between objects that hide data behind behavior and data structures that expose data for simple procedures.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 6, printed pages 93-101 (PDF pages 124-132)
    project: clean-code
    language: English
related_keys: []
---

Hide implementation details behind abstractions rather than exposing fields through public variables or automatic getters and setters. An abstraction lets callers work with the meaning of the data while leaving its representation and access policy changeable.

Objects and data structures optimize for different kinds of change. Objects hide data and expose behavior, making new object types easier to add; data structures expose data and let procedures add new operations without changing the structures. Neither style wins everywhere, so choose according to whether the system is more likely to gain types or behaviors.

Keep the boundary honest. A method should talk to its own object, its arguments, objects it creates, and its own fields—not navigate through strangers returned by those objects. Avoid train-wreck chains when they expose object internals, but remember that the Law of Demeter does not apply in the same way to deliberately open data structures. Hybrids that expose data while also carrying substantial behavior make both kinds of change difficult.

Use DTOs and Active Records as data structures when they are translating or transporting data, and keep business rules in objects that own behavior. Beans with getters and setters can still expose representation; the important question is whether the interface hides the data's implementation and makes the intended operation clear.
