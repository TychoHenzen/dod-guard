## Why

`dod-guard cover` only recognizes `// covers:` markers (JS/TS line comments) and
`test(`/`it(` calls (JS/TS test frameworks). Projects that use Python, Go, Rust,
or any non-JS language get zero bindings because the marker regex rejects `#`
comments and the test-call regex rejects `def test_` declarations. The test-file
discovery (`testGlobsForGroup`) is also hardcoded to `.test.ts`/`.test.js`
extensions, so even if the regexes matched, the scanner would never open a `.py`
or `_test.go` file.

## What Changes

- `markers.ts`: detect the comment prefix and test-declaration pattern from the
  file extension, so `# covers:` in Python and `// covers:` in Go/Rust/JS all
  bind the same way
- `package-dir.ts`: resolve test-file globs from a project-level configuration
  (`openspec/test-globs.json`) instead of hardcoding them, with a built-in
  fallback for projects that do not provide one
- Test coverage for the new language patterns

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dod-guard/coverage-gate`: Requirement R1 changes from JS/TS-only marker
  recognition to file-extension-dispatched polyglot marker recognition.
  Test-file discovery becomes configurable per project.

## Impact

- `packages/dod-guard/src/cover/markers.ts` - new per-language regex tables,
  file-extension dispatch
- `packages/dod-guard/src/cover/package-dir.ts` - read `openspec/test-globs.json`
  for configurable globs, keep current behavior as the built-in fallback
- Existing JS/TS projects see no behavior change (same regexes, same globs)
- External projects gain the ability to use `dod-guard cover` with their own
  language's comment syntax and test conventions
