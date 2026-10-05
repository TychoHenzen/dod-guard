# Chapter-only dispositions

These records preserve Clean Code guidance that is useful to a human review but
does not have an honest generic static-analysis oracle. They are not scanner
rules, metric gates, or permission to infer domain intent from syntax.

The rule matrix in `rules.md` indexes these dispositions. A retained finding
must have a source-backed syntax boundary and actionable remediation; where
that proof is absent, the generic scanner stays quiet.

## Wildcard imports — retain only syntax-proven forms

**Source:** `smells-and-heuristics/overview.md`, which requires explicit
dependencies and warns against turning a heuristic into a mechanical rule.

**Disposition:** Retain `wildcard-import` for Python `from module import *` and
Rust `use path::*`, where the scanner can identify the wildcard syntax itself.
Keep C# namespace `using`, TypeScript namespace imports and `export *`,
inherited or static constants, and enum-like declarations quiet. Those forms
do not prove the same dependency-hiding boundary without language-specific
semantic analysis.

## Else branches — review signal, not blanket ban

**Source:** `functions/polymorphism-and-names.md` and
`functions/small-and-focused.md`, which favor clear control flow while leaving
legitimate alternatives to design judgment.

**Disposition:** Retain `else-branch` as a syntax-only preferred review signal.
Do not treat every `else` as a defect: a genuine two-way branch with equally
normal outcomes is legitimate. Guard clauses and polymorphism are remediation
options, not mandatory rewrites. Conflict fixtures and cross-language
dispositions are owned by the separate integration work.

## Stateless methods — syntax-only candidate

**Source:** `classes/srp-and-class-size.md` and
`emergence/pragmatic-size.md`, which favor cohesive responsibilities without a
fixed class-size law.

**Disposition:** Retain `stateless-method` only as a syntax-backed candidate
for moving behavior to a free function. The scanner may inspect direct
receiver and declared-field use, but it must not infer ownership intent,
inheritance, framework callbacks, property semantics, or domain boundaries.
An apparently stateless method can be the correct API surface; review the
actual type contract before moving it.

## Assumption markers — retired from generic scanning

**Source:** `comments/good-comments.md` and `comments/intent-and-limits.md`,
which reserve comments for useful intent and context rather than a generic
token policy.

**Disposition:** `assumption-marker` is retired from the configured rule set,
report ordering, and preflight selection. The token `ASSUMPTION` has no
source/use semantic contract that the generic scanner can prove, so it is
quiet rather than a policy finding. Repositories that need assumption
tracking must define an explicit source, owner, and use contract outside this
generic rule; no such contract is added here.

## Null-like arguments — not planned for generic analysis

**Source:** `clean-code/error-handling/special-cases-and-null.md`, Clean Code
Chapter 7, printed pages 109–112 (PDF pages 140–143).

**Disposition:** Generic Quality Guard remains quiet when a call passes `null`,
`None`, `nil`, or another null-like value. The syntax alone cannot prove that
the value violates an API contract: the callee may explicitly accept absence,
use it as a protocol value, or apply a documented default.

The current scanner operates on stripped source and declarations. It does not
resolve call targets, overloads, nullability metadata, non-null contracts,
default semantics, or whether the argument is an intentional protocol value.
Adding a syntax-only finding would therefore create false positives rather
than actionable review evidence.

Before a future contract-aware rule can report anything, it must provide all of
the following:

- a resolved call target and overload;
- nullability or other explicit contract metadata;
- positive, legitimate-negative, boundary, and unsupported fixtures for every
  supported language; and
- actionable remediation tied to the resolved contract.

This disposition does not weaken a future explicit contract rule. It also does
not duplicate the separate Chapter 7 disposition for null-like return values.
