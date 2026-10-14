# AGENTS.md

Shared agent guidance for work in `packages/quality-guard`.

## What this package is

An advisory structural and test-quality diagnostic package with current-state
reports, plaintext readability checks, a pull-request gate, and an MCP server.
Quality Guard output is evidence for human review; the pull-request gate is the
one place it decides a merge, and it decides only on high-severity findings in
files the pull request changed. It does not persist a quality decision.

| Part | Where | Role |
|------|-------|------|
| Scanner | `skills/quality-refactor/scripts/` | Zero-dependency structural scanner. The single implementation. |
| Pull-request gate | `skills/quality-refactor/scripts/quality-pr-gate.mjs` | CI check. Fails when a changed file has a high-severity finding. Runs in CI, never on writes. |
| Script entrypoint | `scripts/quality-guard.mjs` | File-local feedback script. Not registered as a hook. |
| Reports | `src/` and `scripts/` | Current-state structural, test-quality, and readability evidence. |
| MCP server | `src/` | Three advisory tools: `quality_scan`, `quality_report`, and `quality_test_quality`. |

The scanner lives with the skill, not in `src/`, because it must run with no
build step and no dependencies. The gate and the server both reach into it
rather than reimplementing it. No package path creates or consumes
stored acceptance state.

## Supported contracts

The supported CLI paths are:

- `skills/quality-refactor/scripts/quality-scan.mjs` for structural diagnostics.
- `skills/quality-refactor/scripts/quality-pr-gate.mjs --base=<ref> --root=<dir>` for the pull-request gate.
- `quality-guard report` for current-state report evidence.
- `quality-guard test-quality` for explicit Clean Code test evidence.
- `quality-guard readability --stdin` for complete plaintext supplied by an
  agent runtime.

The legacy `quality-guard check` and `quality-guard acknowledge` names remain
compatibility entry points where shipped callers still use them. They return
advisory JSON or a compatibility response only; they do not inspect staged or
committed trees, authorize a commit, or write persisted quality state. Do not
document them as acceptance commands or add new callers.

## Plaintext boundary

`quality-guard readability --stdin` reads the complete response from standard
input and invokes the optional Python `textstat` runtime. The policy and
result states live in `src/plaintext-readability.ts`; missing, timed-out,
unsupported, and malformed provider output is `unavailable` and exits 0. Plaintext
readability is not part of the pull-request gate. Do not merge the plaintext
result into structural findings or persisted quality state.

## Build and test

```bash
npm run build -w packages/quality-guard    # tsc
npm test -w packages/quality-guard         # tsc + dist tests + script tests + scanner tests
npm run bundle -w packages/quality-guard   # esbuild to dist/bundle.js
```

Three test roots run, and all three must stay wired in `package.json`:
`dist-test/tests/src/**/*.test.js`, `tests/scripts/*.test.mjs`, and
`tests/skill-scripts/quality-refactor/scripts/lib/*.test.mjs`.

Production TypeScript remains in `src/`. Plain production scripts remain in
`scripts/` and `skills/`. Test sources and fixture code live under
`tests/`. The TypeScript test project writes to `dist-test/`, so test code
cannot enter the shipped `dist/` bundle or skill paths.

## Evidence boundaries

Structural, test-quality, coverage, audit, and readability results are
diagnostic evidence. They should be current and understandable. Only the
pull-request gate turns a result into a check, and only for high-severity
findings in files the pull request changed. Do not create or consume
stored acceptance state as part of this package.

Correctness still matters. Build and test failures, plugin configuration,
workflow validation, lockfile drift, generated-file drift, bundle and package
integrity, and Biome errors remain authoritative repository checks. A missing,
timed-out, unsupported, or malformed optional diagnostic provider is reported
as unavailable and fails open; do not call unavailable evidence a pass.

## Cross-language boundary

`scripts/` is plain `.mjs` so that a command can run it without a build step.
`src/` is TypeScript. The structural scanner treats every supported language
the same way: one rule set, run against TypeScript/JavaScript, C#, Rust,
Python, Go, Java/Kotlin and C/C++ alike. The optional project linter,
`scripts/project-linter.mjs`, does not. ESLint and ruff check one file
directly, so they share the ten-second per-file timeout. Clippy
(`rust-linter.mjs`) and the `dotnet format` analyzers
(`csharp-linter.mjs`) have no single-file mode. Both always look at the
whole crate or solution, so both share a longer sixty-second timeout instead
(`linter-timeout.mjs`). Both fail open: a timeout, a missing `cargo` or
`dotnet` binary, or output that will not parse all come back as no findings,
never as a blocked write. Both also report only diagnostics the project's own
configuration rates as an error, the same restriction the ESLint branch
already applies to rules the repository turned on as errors.

## Rules that bite

- The pull-request gate fails closed. An internal error exits 2 and leaves the
  check red; it never reports a pass.
- Per-file scans cannot decide `duplicate-block`, `dead-export` or
  `test-only-export`. Those need whole-project reachability, so a per-file run
  would call every export dead. `FILE_RULES` in
  `quality-guard-gate-scan.mjs` lists what a single-file scan may judge.
- `comment-bloat` and `comment-restates-code` judge a comment against the
  code under it, so `rules-comments.mjs` reads the blanked source, not the raw
  file. A blanked line is whitespace exactly where a comment was, which is how
  a standalone comment is told from a trailing one and how a block's subject
  is found. Hand it the raw source and every comment reads as code.
- `partial-type-length` is file-local but reads the scanned file's directory.
  A C# `partial` type split across hand-written siblings is measured as one
  class, so the scanner still sees a long class after its members are
  moved into another `partial` file. Generated `*.g.cs` and designer files
  are not counted.
- Point `--root` at the repository, not at the target directory. Manifest
  files such as Godot scenes are collected from the root, and a scene that
  wires a class usually sits above the scanned subdirectory.
- Declare harness directories with `--test-path`. Without it the scanner
  reads test-support code as production code that only tests call.
- `rust-linter.mjs` and `csharp-linter.mjs` only run when the repository root
  has a `Cargo.toml` or a `.sln`/`.csproj`. Outside one they return no
  findings, the same as a timeout or a missing binary. A quiet write there is
  not proof the crate or solution is clean.
- The fixture corpus at
  `tests/skill-scripts/quality-refactor/scripts/lib/target/` holds one
  realistic file per supported language, checked by
  `language-fixtures.test.mjs`. It sits in a directory literally named
  `target` on purpose: that name is in the scanner's own `IGNORED_DIRS`
  (`config.mjs`), which is the only reason the corpus never trips the
  structural diagnostic. Rename the directory and it starts scanning
  deliberately bad fixture code as a real regression.

Use `apply_patch` for edits. Keep documentation and tests focused on the
current advisory/report-only contract; do not revive retired decision-ledger
language to explain a fixture or compatibility path.
