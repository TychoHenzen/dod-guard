# Chapter-only dispositions

These records preserve Clean Code guidance that is useful to a human review but
does not have an honest generic static-analysis oracle. They are not scanner
rules, metric gates, or permission to infer domain intent from syntax.

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
