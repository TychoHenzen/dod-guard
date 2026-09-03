## 1. Backend: test body extraction

- [x] 1.1 Add `findTestBody` to the `LanguageSpec` interface in `languages.ts`. Implement brace-counting body extraction for `JS_SPEC`, `GO_SPEC`, `RS_SPEC`, `JAVA_KT_SPEC`, and `SH_SPEC`. Implement indentation-based body extraction for `PY_SPEC` and `RB_SPEC`.
<!-- covers: openspec-dashboard/scenario-coverage :: The test body extraction covers brace-delimited and indentation-delimited languages :: Brace-delimited test body extraction -->
<!-- covers: openspec-dashboard/scenario-coverage :: The test body extraction covers brace-delimited and indentation-delimited languages :: Indentation-delimited test body extraction -->
<!-- covers: openspec-dashboard/scenario-coverage :: The test body extraction covers brace-delimited and indentation-delimited languages :: Test body with nested braces -->

- [x] 1.2 Add `testBody?: string` to `MarkerBinding` in `markers.ts`. Call `lang.findTestBody` after `findTestName` succeeds and attach the result.
<!-- covers: openspec-dashboard/scenario-coverage :: The dashboard resolves scenario-to-test bindings for a project :: A project has bound and unbound scenarios -->

## 2. Dashboard: pass test body through

- [x] 2.1 Verify `project-reads.mjs` passes `testBody` through in the `coverage` object entries. The field flows automatically from `scanMarkers` through the binding map, so this is a verification step, not a code change.
<!-- covers: openspec-dashboard/scenario-coverage :: The spec detail API includes coverage bindings :: Spec detail response includes bindings -->

## 3. Dashboard: foldout UI

- [x] 3.1 Replace the flat `<span class="cov-label cov-bound">` in `render-spec.mjs` with a `<details>/<summary>` element. The `<summary>` shows the test name. The foldout body shows `<pre><code>` with the test source from `coverageEntry.testBody`. Keep the unbound `<span>` unchanged.
<!-- covers: openspec-dashboard/ui :: A spec opens down to its scenarios :: A bound scenario shows its test name -->
<!-- covers: openspec-dashboard/ui :: A spec opens down to its scenarios :: Clicking the foldout reveals the test body -->
<!-- covers: openspec-dashboard/ui :: A spec opens down to its scenarios :: An unbound scenario shows no test -->

- [x] 3.2 Add CSS for the foldout in `style.css`: style the `<details>` to fit inline with the scenario layout, style the `<pre><code>` block with a subtle background and monospace font, and keep the summary cursor as pointer.

## 4. Smoke test

- [x] 4.1 Run the dashboard locally (`node tools/openspec-dashboard/serve.mjs`), open a spec with bound scenarios, and confirm the foldout opens and shows test source.
