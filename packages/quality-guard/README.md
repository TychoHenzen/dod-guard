# quality-guard

`quality-guard` provides advisory structural diagnostics, current-state
reports, test-quality evidence, and an optional plaintext readability check.
Its output is read-only evidence for human review. It does not accept commits
or merges and does not persist an acceptance result.

## Diagnostic paths

| Path | Purpose |
| --- | --- |
| `skills/quality-refactor/scripts/quality-scan.mjs` | Structural findings for the supplied repository scope. |
| `quality-guard report --root=<repository>` | Current-state structural and architecture report. |
| `quality-guard test-quality --root=<repository>` | Clean Code test evidence from a JSON manifest. |
| `quality-guard readability --stdin` | Complete plaintext supplied by an agent runtime. |

Run the scanner directly when a structural report is needed:

```bash
mkdir -p "<repository>/.quality"
node skills/quality-refactor/scripts/quality-scan.mjs . \
  --root=<repository> --top=20
node skills/quality-refactor/scripts/quality-scan.mjs . \
  --root=<repository> --format=units > "<repository>/.quality/units.json"
quality-guard report --root=<repository> > "<repository>/.quality/quality-report.json"
```

The compatibility CLI names `check` and `acknowledge` are not delivery
commands. Where a shipped caller still invokes them, they return advisory
compatibility JSON without inspecting repository state, authorizing work, or
writing stored acceptance state. Do not add new callers.

## Test-quality evidence

When a repository supplies `.quality/test-quality.json`, inspect its explicit
Clean Code Chapter 17 evidence:

```bash
quality-guard test-quality --root=<repository> \
  --evidence=.quality/test-quality.json
```

The evidence file is a language-neutral JSON manifest (`schemaVersion: 1`)
with `sources`, `tests`, and optional `coverage`, `bugs`, `failures`,
and `timing` sections. A source declares behavior and boundary IDs; a test
declares the IDs it exercises, status, language, and optional duration.
Coverage is per-source evidence from any provider, not a universal percentage
threshold. Bug links, normalized failure signatures, skip reasons,
boundary input/expected oracles, explicit uncovered behavior links, and
test-class budgets make the remaining evidence explicit. Normalize provider
output for C#, Python, TypeScript, and Rust in the same manifest; aliases such
as `cs`, `py`, `ts`, and `rs` are accepted.

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

The report emits review-only T1-T9 findings with remediation and evidence
payloads. T1 checks declared behavior coverage, T2 checks coverage evidence,
T3 checks trivial documentary tests, T4 checks ambiguity skips, T5 checks
boundaries, T6 checks linked bug regressions, T7 clusters repeated runtime
failures, T8 correlates explicitly linked uncovered behavior regions with
failures, and T9 compares measured durations with declared environment budgets.
Missing evidence is reported as unavailable or invalid; it never becomes zero
coverage or an acceptance failure. A missing default file is quiet and returns
an empty unavailable report.

## Plaintext readability

Check complete plaintext supplied by an agent runtime:

```bash
printf '%s' "$TEXT" | quality-guard readability --stdin
```

The readability boundary uses the optional Python `textstat` runtime. It
normalizes input with Unicode NFKC, removes Markdown markers, link targets,
citation markers, identifiers, URLs, and fenced or inline code, then counts
Unicode-letter words. Non-ASCII Latin prose remains. Other language scripts
are reported as unsupported. For Flesch Reading Ease `ease` and
Flesch-Kincaid Grade `grade`, it calculates
`easeScore = clamp(ease / 60 * 100, 0, 100)` and
`gradeScore = clamp((12 - grade) / (12 - 9) * 100, 0, 100)`. The combined
score is `0.6 * easeScore + 0.4 * gradeScore`, rounded to two decimals. A
combined score of 80 passes, subject to a maximum sentence length of 25 words.
Empty or shorter-than-20-word input is skipped. A sentence over that limit
fails the bounded dyslexia-friendly heuristic. These are readability
heuristics, not clinical accessibility validation.

The command returns `pass`, `fail`, `skipped`, or `unavailable` JSON. A
failed check exits 2. Missing, timed-out, unsupported, or malformed
`textstat` execution returns `unavailable` and exits 0, so the check fails
open without claiming a passing score. The PostToolUse hook only receives
supported file-write payloads and cannot expose complete assistant chat prose.
Runtimes that can provide the final response should pipe it through this
command.

## Hook and MCP server

The shipped PostToolUse hook is optional file-local feedback for compatible
agent runtimes. It is fail-open: internal failures and unavailable optional
providers do not block a write. It reports only high-severity findings for
the written file; medium and low findings stay in `quality_scan` and
`quality_report` output. A repository may wire its own correctness checks
separately; build, test, workflow, lockfile, generated-file,
bundle/package-integrity, and Biome-error checks remain authoritative.

The server exposes three advisory tools: `quality_scan`, `quality_report`,
and `quality_test_quality`. `quality_report` scores supported source files
under the repository root and adds an unscored current-state architecture
audit. Findings that belong to the repository rather than a scanned source
file, such as a missing root build or test entry point, are listed unscored
under `projectFindings` and counted in `summaries.overall` and
`summaries.project`. Use `quality_test_quality` when an MCP client has a
test-evidence manifest.

The shipped `.mcp.json` points at the host-managed loopback endpoint
`http://127.0.0.1:21720/servers/quality-guard/mcp`. Start the matching PM2
app with `tools/mcp-host/ecosystem.config.cjs`;
`MCP_HOST_QUALITY_GUARD_PORT`, `MCP_HOST_QUALITY_GUARD_PATH`, and
`MCP_HOST_BIND_HOST` are configurable, but the bind host must remain
loopback. The health endpoint is the corresponding `/health` path.
The tracked registration contains the defaults; when a port or path override
is used, run `node tools/mcp-host/launcher.mjs --print-config` and use its
`mcpServers` object for the client registration.

Every project-sensitive MCP tool requires an explicit `root` argument. The
server validates that root before scanning or reading repository state; it
never substitutes the HTTP process working directory. CLI commands retain
their existing command-line defaults.
