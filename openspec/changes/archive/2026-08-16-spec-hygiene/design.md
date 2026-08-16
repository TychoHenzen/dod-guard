## Context

The spec tree holds 929 scenarios across 54 spec files. 47% (434) are compound:
one scenario claims to cover multiple independent obligations. The coverage gate
reports these as 1/1, hiding untested claims. See proposal.md for motivation.

Existing infrastructure:
- `project-reads.mjs` already parses `### Requirement:` and `#### Scenario:`
  headings from spec files via `parseSpecTitles`
- `render-spec.mjs` shows a bound/total chip per requirement
- `check-skill-hygiene.mjs` is the nearest CI script in shape and wiring

## Goals / Non-Goals

**Goals:**
- Detect compound requirements by counting RFC 2119 obligation keywords
- Make the obligation delta visible in CI (warning) and the dashboard (chip)
- Provide an interactive skill to split compounds and re-assign test bindings

**Non-Goals:**
- Automatic splitting without user confirmation
- Semantic analysis of whether an "and" joins one action or two claims
- Ratchet or baseline machinery for the compound count
- Changing the OpenSpec spec format itself

## Decisions

### 1. Detection by keyword count, not NLP

Count `SHALL`, `MUST`, `SHOULD`, `MAY`, `REQUIRED`, `OPTIONAL`, `RECOMMENDED`
with `/\b(SHALL|MUST|SHOULD|MAY|REQUIRED|OPTIONAL|RECOMMENDED)\b/gi`. Compare
count to scenario count. Delta > 0 means uncovered obligations.

Alternative: parse "and" conjunctions in THEN clauses. Rejected because "and"
is ambiguous ("reads and returns" is one action, "reads and exits 0" is two).
RFC 2119 keywords are unambiguous structural markers already present in the
spec format.

### 2. Count keywords in requirement body only, not scenario text

The requirement body between `### Requirement:` and the first `#### Scenario:`
is where obligations live. Scenario text restates the obligation as a test
condition - counting keywords there would double-count. The existing
`parseSpecTitles` function already identifies these boundaries; the new module
extends the parse to capture the body text between them.

### 3. Shared module at `scripts/ci/lib/obligation-count.mjs`

The counting logic is needed in three places: the lint script, the dashboard,
and the splitter skill. A shared module avoids three implementations drifting.

Location: `scripts/ci/lib/` rather than `tools/openspec-dashboard/lib/` because
the lint script is the primary consumer, and the dashboard already re-exports
from other packages (see `markers.mjs`). The dashboard and skill import from
`scripts/ci/lib/`.

The module exports two functions:
- `countObligations(bodyText)` - returns the keyword count for a string
- `analyzeSpec(specFilePath)` - returns an array of `{ requirementTitle,
  obligationCount, scenarioCount, delta }` objects

### 4. Warning-only mode, no ratchet

The lint script prints warnings and exits 0. A `--strict` flag makes it exit 1,
for the day the compound count reaches zero. No baseline file, no adoption
logic. The dashboard chip makes the trend visible without CI machinery.

Alternative: ratchet like the quality baseline. Rejected because the existing
434 compounds need interactive splitting, not automated enforcement. A ratchet
that adopts all 434 on day one protects nothing.

### 5. Dashboard chip on the requirement block

`render-spec.mjs` already renders a `bound/total` chip per requirement via
`covClass`. Add a second chip next to it: `N uncovered` in a warning color when
the obligation delta is positive. The data comes from `analyzeSpec` called in
`specDetail` in `project-reads.mjs`, which already parses the spec file.

### 6. Skill reads test assertions for re-binding

When a compound scenario bound to a test splits, the skill reads the test
function body (already available via `testBody` in coverage data), extracts
assertion strings, and matches each against the proposed sub-scenarios by
keyword overlap. The match is a suggestion the user confirms, not an automatic
binding.

## Risks / Trade-offs

**Keyword count overestimates obligations in list-style requirements.** A
requirement saying "the scanner SHALL apply rules to TypeScript, JavaScript,
Python, Go, Java, Kotlin, C, and C++" has one SHALL but lists eight languages.
The delta shows 0 (one SHALL, one or more scenarios), which is correct - the
obligation is "apply rules to all supported languages", not eight separate
obligations. No mitigation needed.

**Keyword count underestimates when a single SHALL carries implicit sub-claims.**
A requirement saying "the scanner SHALL emit a report holding the profile, the
count, and the summary" packs three deliverables into one SHALL. The delta shows
0, but three things need testing. Mitigation: the interactive splitter can flag
comma-separated lists inside a single SHALL clause as "review candidates",
though this is a softer signal than the keyword count.

**The /spec-split skill needs LLM judgment for scenario text.** Proposing "WHEN
the VOCAB tuple is inspected / THEN it has at least 256 entries" from the
requirement text "SHALL contain at least 256 entries" is straightforward
extraction, but edge cases need human review. The skill proposes and waits;
it does not write without confirmation.
