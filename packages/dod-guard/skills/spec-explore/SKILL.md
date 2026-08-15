---
name: spec-explore
description: >-
  Discover missing requirements, edge cases, error paths, and implicit
  assumptions in an existing OpenSpec spec by reading the spec and the
  implementation that backs it. Produces a delta spec the user can review and
  selectively adopt. TRIGGER when: user says "explore this spec", "what is
  this spec missing", "expand requirements for X", "find gaps in the spec",
  "what edge cases am I missing", or "deepen this spec". DO NOT TRIGGER for
  writing tests (that is /spec-test), auditing existing tests (that is
  /test-integrity-checker), or extracting a spec from scratch (that is
  /spec-extract).
argument-hint: "<capability-path under openspec/specs/>"
---

# Spec Explore

Read an existing OpenSpec spec and the source files that implement it. Compare
observable behavior against documented requirements. Produce a delta spec of
proposed new requirements and scenarios the original author did not write down.

## Input

The user provides a capability path, the directory path under `openspec/specs/`
(e.g. `dod-guard/interview` or `quality-guard/structural-scan`). If the user
gives a bare name, search `openspec/specs/` for a matching leaf directory.

If the path does not resolve to a spec file, report which path you tried and
stop.

## Steps

1. Read the spec at `openspec/specs/<capability-path>/spec.md`. Note its
   Purpose section, every requirement title, and every scenario.

2. Identify the package or tool that implements this capability. The first
   segment of the capability path names the group:
   - Groups matching a directory under `packages/` map to `packages/<group>/src/`
   - The group `openspec-dashboard` maps to `tools/openspec-dashboard/`

3. Read the implementation source files in that directory. Focus on:
   - Functions, methods, and exported APIs that relate to the spec
   - Error handling paths
   - Boundary checks and guard clauses
   - Default values and fallback behavior
   - Configuration options

4. For each piece of observable behavior in the implementation that the spec
   does not mention, draft a proposed requirement with at least one scenario.
   Focus on:
   - Error conditions the spec does not cover
   - Boundary and edge cases (empty input, maximum size, concurrent access)
   - Implicit assumptions the implementation makes
   - Default behavior when optional parameters are absent
   - Side effects the caller might rely on

5. For each existing requirement, check whether its scenarios cover the
   failure modes. If a requirement has only happy-path scenarios, propose
   additional scenarios for the error and boundary cases.

## Output

Write the proposals as a delta spec file using the standard format:

```markdown
## ADDED Requirements

### Requirement: <name>
<description using SHALL/MUST>

#### Scenario: <name>
- **WHEN** <condition>
- **THEN** <expected outcome>
```

Print the delta to the conversation. Tell the user they can adopt proposals
into the main spec by copying the relevant blocks, or by using the output as
input to `openspec new change`.

Do not modify the existing spec file. Do not modify any implementation files.
