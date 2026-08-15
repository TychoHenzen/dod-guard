## Context

See proposal.md for motivation. `markers.ts` has two regexes: `MARKER_RE`
matches `// covers:` and `TEST_CALL_RE` matches `test(`/`it(`. Both are
JS/TS-only. `package-dir.ts` hardcodes test-file globs to `.test.ts`,
`.test.js`, `.test.mjs`. External projects using other languages get zero
bindings.

## Goals / Non-Goals

**Goals:**
- Recognize covers markers written with any supported language's comment prefix
- Recognize test declarations for Python, Go, Rust, Ruby, Java/Kotlin, shell
- Let projects declare their own test-file globs via `openspec/test-globs.json`
- Keep existing JS/TS behavior identical

**Non-Goals:**
- Supporting block comments (`/* */`, `""" """`) as marker carriers
- Auto-detecting test frameworks or inferring globs from build files
- Changing the marker format itself (still `covers: group/cap :: req :: scen`)

## Decisions

### 1. File-extension dispatch table instead of universal regexes

A single regex that matches `//`, `#`, and `--` as comment prefixes would also
match non-comment lines in some languages (Python's `#` is a comment, but `//`
is integer division). Dispatching on file extension keeps each language's regex
precise.

Alternative considered: a single combined regex `^\s*(?:\/\/|#|--)\s*covers:`.
Rejected because it cannot distinguish the test-declaration pattern, which
varies more than the comment prefix. The dispatch table handles both in one
lookup.

### 2. Language table as a const map in markers.ts

Each entry maps a set of file extensions to a `{ markerRe, testDeclRe,
extractTestName }` triple. `extractTestName` is a function that pulls the test
name from the regex match, because the name sits in different positions across
languages (Python: the function name after `def`, Go: the function name after
`func`, JS: the first string argument to `test(`).

The table lives in `markers.ts` next to `markersInFile`, not in a config file,
because adding a language requires writing a regex and a name extractor, not
just a string.

### 3. test-globs.json for configurable test-file discovery

Shape: `{ "<group>": ["glob1", "glob2"] }`. Loaded once per `scanMarkers` call.
Falls back to the existing `testGlobsForGroup` when the file is absent or has
no entry for the group. This keeps the current monorepo behavior unchanged and
lets external projects point the scanner at their own test directories.

Alternative considered: extending `entry-points.json`. Rejected because
entry points and test globs are orthogonal concerns, and `entry-points.json`
is already keyed by package directory, not by spec group.

### 4. Rust #[test] handled as a two-line lookahead

Rust's `#[test]` attribute sits on the line above `fn test_name()`. The
scanner already does a forward lookahead from the marker to the next non-blank
line. For Rust, the marker must be above `#[test]`, and the `fn` line is
extracted from the line after `#[test]`. This means the marker, the attribute,
and the function declaration span three consecutive non-blank lines.

## Risks / Trade-offs

- [Risk] A language not in the table gets zero bindings silently.
  -> Mitigation: `dod-guard cover` already reports unwired scenarios. A project
  whose tests are all unwired will see that in the report. A future improvement
  could warn when a group's glob matches files whose extensions are all unknown.

- [Risk] The test-name extraction regexes may not cover every test framework
  variant (e.g. pytest parametrize decorators, Go table-driven subtests).
  -> Mitigation: the first version covers the common patterns. Framework-specific
  extensions can be added to the table without changing the dispatch mechanism.

- [Trade-off] The language table is hardcoded, not pluggable per project.
  -> Acceptable because adding a language is a one-line table entry plus a regex,
  and covering the major languages handles the practical need.
