# quality-guard

`quality-guard` separates fast write feedback from the decision that accepts a commit.

## Decision layers

| Layer | Purpose | What it does not prove |
| --- | --- | --- |
| PostToolUse hook | File-local feedback after a supported source write. It checks normal hard bounds and a read-only baseline. | Repository reachability, dependency boundaries, staged architecture, or commit readiness. |
| `quality-guard check --staged` | Authoritative staged decision. It compares the index with `HEAD`, checks structural and architectural evidence, and returns `PASS`, `REVIEW_REQUIRED`, or `FAIL`. | That CI has accepted the commit. |
| Architecture acknowledgement | Records a reviewer reason and author for a review finding. The record is valid only for the current staged fingerprint. | A different staged source snapshot. |
| CI committed-tree replay | Runs the same decision against a committed tree and its first parent. | Unrelated repository checks. |

Run the staged decision before committing:

```bash
quality-guard check --staged --json
```

`quality-guard report --root=<repository>` regenerates the dashboard report
for a repository and writes the JSON result to standard output. It is
read-only with respect to the repository.

Evaluate explicit Clean Code Chapter 17 test evidence with:

```bash
quality-guard test-quality --root=<repository> \
  --evidence=.quality/test-quality.json
```

The evidence file is a language-neutral JSON manifest (`schemaVersion: 1`)
with `sources`, `tests`, and optional `coverage`, `bugs`, `failures`, and
`timing` sections. A source declares behavior and boundary IDs; a test declares
the IDs it exercises, status, language, and optional duration. Coverage is
per-source evidence from any provider, not a universal percentage threshold.
Bug links, normalized failure signatures, skip reasons, boundary input/expected
oracles, and test-class budgets make the remaining evidence explicit. Normalize
provider output for C#,
Python, TypeScript, and Rust in the same manifest; aliases such as `cs`, `py`,
`ts`, and `rs` are accepted.

Smallest useful manifest:

```json
{
  "schemaVersion": 1,
  "sources": [{
    "path": "src/parser.py",
    "language": "python",
    "behaviors": [
      {"id": "parser.normal", "kind": "behavior"},
      {
        "id": "parser.empty",
        "kind": "boundary",
        "boundary": {"input": "empty", "expected": "empty-result"}
      }
    ]
  }],
  "tests": [{
    "id": "parser.empty.test",
    "path": "tests/parser_test.py",
    "language": "python",
    "covers": ["parser.normal", "parser.empty"],
    "status": "passed"
  }]
}
```

The report emits review-only T1-T9 findings with a remediation and evidence
payload. T1 checks declared behavior coverage, T2 checks coverage evidence,
T3 checks trivial documentary tests, T4 checks ambiguity skips, T5 checks
boundaries, T6 checks linked bug regressions, T7 clusters repeated runtime
failures, T8 correlates uncovered regions with failures, and T9 compares
measured durations with declared environment budgets. Missing evidence is
reported as unavailable or invalid; it never becomes zero coverage or a commit
gate failure. A missing default file is quiet and returns an empty report.

Comment findings stay deliberately conservative: `comment-metadata` reports
explicit metadata/history tags, `comment-placeholder` reports deterministic
placeholder text, and `comment-missing-reference` checks only explicit
`@see path[#Symbol]` and `@config file:key` references. Age, prose quality,
grammar, and ordinary explanatory comments are not generic findings.

Check complete plaintext supplied by an agent runtime with:

```bash
printf '%s' "$TEXT" | quality-guard readability --stdin
```

The readability boundary uses the optional Python `textstat` runtime. It
normalizes input with Unicode NFKC, removes Markdown markers, link targets,
citation markers, identifiers, URLs, and fenced or inline code, then counts
Unicode-letter words. Non-ASCII Latin prose remains. Other language scripts
are reported as unsupported. For Flesch Reading Ease `ease` and Flesch-Kincaid
Grade `grade`, it calculates `easeScore = clamp(ease / 60 * 100, 0, 100)` and
`gradeScore = clamp((12 - grade) / (12 - 9) * 100, 0, 100)`. The combined score
is `0.6 * easeScore + 0.4 * gradeScore`, rounded to two decimals. A combined
score of 80 passes, subject to a maximum sentence length of 25 words. Empty or
shorter-than-20-word input is skipped. A sentence over that limit fails the
bounded dyslexia-friendly heuristic. These are readability heuristics, not
clinical accessibility validation.

The command returns `pass`, `fail`, `skipped`, or `unavailable` JSON. A failed
check exits 2. Missing, timed-out, unsupported, or malformed `textstat`
execution returns `unavailable` and exits 0, so the check fails open without
claiming a passing score. The existing PostToolUse hook only receives supported
file-write payloads and cannot expose complete assistant chat prose. Runtimes
that can provide the final response should pipe it through this command.

For a responsibility-moving refactor, provide a repository-relative responsibility map:

```bash
quality-guard check --staged --intent refactor --target .quality/responsibility-map.json --json
```

`PASS` exits 0, `FAIL` exits 1, `REVIEW_REQUIRED` exits 2, and a usage error exits 3.

## Optional Git-hook wiring

The shipped PostToolUse hook is optional feedback for compatible agent runtimes. A repository may also wire its own Git pre-commit hook to run `quality-guard check --staged`. That hook is a convenience only. CI remains authoritative because it replays `quality-guard check --committed HEAD --json` from Git objects.

Codex discovers the plugin hook from `hooks/hooks.json`. After installation or an update, review and trust the hook in `/hooks`; Codex does not run a new plugin hook before that trust step.

## MCP tools

The server exposes `quality_scan`, `quality_report`, `quality_gate`,
`quality_skips`, `quality_commit_gate`, and `quality_test_quality`.
`quality_report` scores every supported source file under the repository root and adds an unscored current-state
architecture audit. Use `quality_commit_gate` when an MCP client needs the same staged decision as the command line.
Use `quality_test_quality` when an MCP client has a test-evidence manifest.
