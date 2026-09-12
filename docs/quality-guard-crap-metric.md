# CRAP Metric Research

## Recommendation

Do not implement a CRAP1-style score in Quality Guard yet. The current scan and
report path has no project coverage input, and its public report does not expose
every method with a comparable complexity and coverage pair.

Keep the original CRAP1 formula as a reference. If a later PBI establishes
reliable method-level inputs, start with an optional `quality_report` result.
That tool is read-only and is not a gate verdict. Do not use the metric to alter
scan thresholds, baselines, or commit decisions without separate evidence.

## Formula

The [Google Testing Blog article](https://testing.googleblog.com/2011/02/this-code-is-crap.html)
defines:

`CRAP1(m) = comp(m)^2 * (1 - cov(m) / 100)^3 + comp(m)`

Here, `comp(m)` is method cyclomatic complexity and `cov(m)` is basis-path code
coverage for that method. The article flags scores above 30. It describes CRAP1
as an empirical, imperfect heuristic developed around Java methods. It also
notes that coverage does not prove test quality, complexity can be justified,
and the formula omits design properties such as cohesion and coupling.

The formula does not establish that file-level coverage or a language-specific
branch percentage has the same meaning as its method-level `cov(m)` input.

## Current Inputs

The scanner maps supported extensions to seven language families in
[`config-values.mjs`](../packages/quality-guard/skills/quality-refactor/scripts/lib/config-values.mjs).
All families share token-pattern counts for `if`, `for`, `while`, `case`,
`catch`, and `&&`, plus a base complexity of one. The complexity additions are
listed in [`rules-file-metrics.mjs`](../packages/quality-guard/skills/quality-refactor/scripts/lib/rules-file-metrics.mjs).

| Language family | Scanner key | Additional complexity patterns | Current coverage input |
| --- | --- | --- | --- |
| JavaScript/TypeScript | `ts` | `??`, ternary, `||` | No target-project input. The package `c8` script covers Quality Guard TypeScript under its own tests. |
| C# | `cs` | `??`, ternary, `when`, `||` | None found in the current scan/report path. |
| Rust | `rs` | `=>`, boolean `||` | None found in the current scan/report path. |
| Python | `py` | `elif`, `and`, `or` | None found in the current scan/report path. |
| Go | `go` | `select`, `||` | None found in the current scan/report path. |
| C/C++ | `cpp` | ternary, `||` | None found in the current scan/report path. |
| Java/Kotlin | `java` | ternary, `||` | None found in the current scan/report path. |

`complexityOf` computes a token-pattern value for each extracted function.
The scanner emits findings according to configured thresholds. The public
[`quality_report`](../packages/quality-guard/src/tool-report.ts) consumes those
findings and assigns a file score from them. It does not expose a complete
method inventory or coverage input.

[`package.json`](../packages/quality-guard/package.json) has a `c8` command for
Quality Guard's own TypeScript sources and tests. It requests text and HTML
reports. It does not collect coverage for an arbitrary repository root. The
[c8 project documentation](https://github.com/bcoe/c8) describes Node/V8
coverage and source-map support. No generic multi-language coverage provider or
per-method coverage ingestion exists in the current repository. External
providers for the other families were not evaluated, so their availability is
unknown rather than impossible.

## Decision Boundary

No currently supported family has a per-method coverage input wired into
Quality Guard. The TypeScript package's self-coverage does not satisfy that
contract for scanned projects. The scanner's token-pattern complexity is also
not evidence that its values match the article's original Java metric.

Therefore, no language family is ready for a general CRAP1 score through the
current report API. A follow-up implementation PBI should first name a concrete
coverage provider and define how it maps coverage to each function. It should
also state which language families have verified inputs and preserve missing or
unmapped coverage as unknown, not as zero. Keep that work report-only until the
metric is validated. Do not assume the article's score threshold transfers to
other language families.

## Sources

- [Google Testing Blog: This Code is CRAP](https://testing.googleblog.com/2011/02/this-code-is-crap.html)
- [c8 documentation](https://github.com/bcoe/c8)
- Current repository code linked above, checked against the supported language
  map, function complexity calculation, report contract, and package coverage
  command.
