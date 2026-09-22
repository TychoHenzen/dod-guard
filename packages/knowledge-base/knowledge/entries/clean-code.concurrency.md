---
key: clean-code.concurrency
title: Concurrency
chapter: clean-code
section: clean-code.concurrency
summary: Isolate concurrency concerns, narrow shared state, and test thread-aware code under varied conditions.
project: clean-code
language: English
sources:
  - label: Clean Code, Chapter 13, printed pages 178-191 (PDF pages 209-222)
    project: clean-code
    language: English
related_keys: []
history: []
---

Use concurrency when it decouples what gets done from when it gets done and the system has a real throughput, latency, or waiting problem. It adds overhead and a different design strategy; it does not automatically make a program faster, and correctness becomes harder to reason about when execution can interleave.

Keep concurrency concerns separate from ordinary application logic. Give thread-aware code its own focused boundary, limit access to shared data, and prefer copies or independently partitioned data when that removes synchronization. Threads should do as much work as possible with private inputs and local state rather than coordinating through a wide shared object.

Know the execution model and the library primitives that fit it. Use thread-safe collections or executor-style coordination where appropriate, keep synchronized sections as small as possible, avoid chains of synchronized method calls, and design shutdown paths early because blocked producers, consumers, or parents can prevent a graceful stop.

Make concurrent code testable under varied conditions. Get the nonthreaded work correct in plain objects first, then make thread-aware boundaries pluggable and tunable so tests can vary thread counts, scheduling, load, platforms, and test doubles. Treat intermittent failures as concurrency evidence rather than one-offs, and use controlled scheduling or instrumentation to expose rare orderings before production does.
