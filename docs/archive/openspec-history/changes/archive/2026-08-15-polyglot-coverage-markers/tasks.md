## 1. Language dispatch table

- [x] 1.1 Add a `LanguageSpec` interface to `languages.ts` with `markerRe` and `findTestName` fields
- [x] 1.2 Build the `LANG_TABLE: Map<string, LanguageSpec>` mapping file extensions to their language spec. Entries: `.ts`/`.js`/`.mjs`/`.cjs` (existing behavior), `.py`, `.go`, `.rs`, `.rb`, `.java`/`.kt`, `.sh`/`.bash`
- [x] 1.3 Refactor `markersInFile` to look up the `LanguageSpec` from the file extension and use its regexes instead of the hardcoded `MARKER_RE` and `TEST_CALL_RE`. Files with unknown extensions return an empty array

## 2. Configurable test-file globs

- [x] 2.1 Add a `loadTestGlobs(cwd: string)` function to `test-globs.ts` that reads `openspec/test-globs.json` and returns a `Record<string, string[]>` (or empty object when the file is absent)
- [x] 2.2 Add validation: each value must be a `string[]`. Exit with usage-error code and name the malformed key on violation
- [x] 2.3 Change `scanMarkers` (or its caller) to call `loadTestGlobs` and prefer its entry for the group over `testGlobsForGroup`. Fall back to the built-in globs when no entry exists

## 3. Tests

- [x] 3.1 Add marker-parsing unit tests for Python (`# covers:` above `def test_`), Go (`// covers:` above `func Test`), and Rust (`// covers:` above `#[test]\nfn`)
- [x] 3.2 Add a test for unknown file extensions returning zero bindings
- [x] 3.3 Add a test for `loadTestGlobs`: file present with valid entry, file absent, file present without group entry, file with malformed entry
- [x] 3.4 Add an integration test: a fixture directory with `.py` and `.ts` test files, both carrying covers markers, and verify `scanMarkers` binds both

## 4. Documentation and metadata

- [x] 4.1 Document `openspec/test-globs.json` format and fallback behavior in `packages/dod-guard/CLAUDE.md` and `packages/dod-guard/USAGE.md`
- [x] 4.2 Update the `markers.ts` header comment and the coverage-gate spec's purpose to mention polyglot support
