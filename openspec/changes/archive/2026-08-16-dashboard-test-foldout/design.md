## Context

`markers.ts` scans test files for `// covers:` comments and returns a `MarkerBinding` with `{ scenarioId, file, testName }`. It already reads the full file content. It does not extract the test body.

`languages.ts` defines a `LanguageSpec` with `findTestName(lines, fromLine)`, which returns the test name but discards the line index where it found the declaration. The body extractor needs that line index and the lines array.

`render-spec.mjs` renders each coverage entry as a flat `<span>` with the test name. This becomes a `<details>/<summary>` element.

## Goals / Non-Goals

**Goals:**
- Extract the test body alongside the existing binding data
- Show the test body in a collapsible foldout in the dashboard

**Non-Goals:**
- Syntax highlighting in the foldout (plain `<pre><code>` is enough)
- Editing tests from the dashboard
- Extracting bodies for languages not already in `LANG_TABLE`

## Decisions

1. **Add `findTestBody` to `LanguageSpec`.** A new method `findTestBody(lines: string[], fromLine: number): string | null` extracts lines from the declaration through the end of the function. For brace-delimited languages, it tracks `{}`-nesting depth. For indentation-delimited languages (Python, Ruby `def`), it reads until a non-blank line at equal or lesser indent. `findTestName` stays unchanged - `markers.ts` calls both.

   Alternative: combine name and body into one call. Rejected because `findTestName` is used independently by `cover`, which does not need the body and should not pay for parsing it. The dashboard path calls both.

2. **Add `testBody` to `MarkerBinding`.** The field is `string | undefined`. When `markers.ts` calls `lang.findTestBody`, a result populates the field. When `findTestBody` is absent on a `LanguageSpec` (gradual rollout), the field stays undefined.

3. **`project-reads.mjs` passes `testBody` through.** The `coverage` object entries already carry `testName` and `file`. Adding `testBody` requires no structural change to the data flow.

4. **`render-spec.mjs` replaces the `<span class="cov-label cov-bound">` with a `<details>` element.** The `<summary>` shows the test name (same visual as today). The body is `<pre><code>` with the test source. Unbound scenarios stay as a flat `<span>`.

## Risks / Trade-offs

- **Larger payloads.** Test bodies add text to the coverage cache and the spec detail response. For the dashboard (local, single user), this is negligible.
- **Brace counting is naive.** Braces inside string literals or comments are counted. For well-formed test functions this is rarely a problem, and a full parser is not justified for a read-only preview.
