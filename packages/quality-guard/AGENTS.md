# AGENTS.md

Shared agent guidance for work in `packages/quality-guard`.

## What this package is

A structural code quality gate, in three parts that all measure the same way:

| Part | Where | Role |
|------|-------|------|
| Scanner | `skills/quality-refactor/scripts/` | Zero-dependency structural scanner. The single implementation. |
| Hook | `scripts/quality-guard.mjs` | PostToolUse gate. Ratchets one written file against the baseline. |
| MCP server | `src/` | 3 tools that ask the same questions on purpose. |

The scanner lives with the skill, not in `src/`, because it must run with no
build step and no dependencies. The hook and the server both reach into it
rather than reimplementing it.

## Build and test

```bash
npm run build -w packages/quality-guard    # tsc
npm test -w packages/quality-guard         # tsc + dist tests + hook tests + scanner tests
npm run bundle -w packages/quality-guard   # esbuild to dist/bundle.js
```

Three test globs run, and all three must stay wired in `package.json`:
`dist/*.test.js`, `scripts/*.test.mjs`, `skills/*/scripts/lib/*.test.mjs`.

## One baseline, one format

The hook and the CI ratchet both read `.github/quality/quality-baseline.json`
at the repository root. The hook does not keep a baseline of its own. It
imports `readBaseline`, `compareToBaseline` and `writeBaseline` from the
scanner through `scripts/baseline-lib.mjs`. That module exists so the path to
the skill appears exactly once.

Baseline format is version 2. It records the file list as well as the counts.
Without that list a file the baseline never scanned cannot be told apart from
a file that was clean, so every extracted file would read as a regression from
zero.

## The sentinel is an audited bypass, not a switch

`.quality-skip` at the repository root waives one blocked write.

| Content | Effect |
|---------|--------|
| empty | Waives the new-file ceiling only. |
| `{"rebaseline": true}` | Also raises a tracked file's bar. |

A plain sentinel never waives a tracked-file regression. That is deliberate,
and `scripts/baseline-gate.test.mjs` pins it.

Every consumption appends to `.github/quality/skip-log.json` with
`acknowledged: false`, and the sentinel is deleted, so the bypass cannot be
left switched on. The pre-commit hook refuses a commit while any record stays
unacknowledged. Read them with the `quality_skips` tool.

This bypass is easy on purpose. It must never be silent.

## Cross-language boundary

`scripts/` is plain `.mjs` because a PostToolUse command cannot depend on a
build step. `src/` is TypeScript. Where the server needs a hook constant it
imports through `scripts/sentinel.d.mts`, and `src/skips.test.ts` asserts that
both sides still agree on the skip-log path. Do not let that assertion go.

The structural scanner treats every supported language the same way: one
rule set, run against TypeScript/JavaScript, C#, Rust, Python, Go,
Java/Kotlin and C/C++ alike. The optional project linter the hook layers on
top, `scripts/project-linter.mjs`, does not. ESLint and ruff check one file
directly, so they share the ten-second per-file timeout. Clippy
(`rust-linter.mjs`) and the `dotnet format` analyzers (`csharp-linter.mjs`)
have no single-file mode. Both always look at the whole crate or solution, so
both share a longer sixty-second timeout instead (`linter-timeout.mjs`). Both
fail open: a timeout, a missing `cargo` or `dotnet` binary, or output that
will not parse all come back as no findings, never as a blocked write. Both
also report only diagnostics the project's own configuration rates as an
error, the same restriction the ESLint branch already applies to rules the
repository turned on as errors.

## Rules that bite

- The hook must exit 0 on any internal failure. A broken gate must not stop work.
- Per-file scans cannot decide `duplicate-block`, `dead-export` or
  `test-only-export`. Those need whole-project reachability, so a per-file run
  would call every export dead. `FILE_RULES` in `quality-guard.mjs` lists what
  a single-file scan may judge.
- `comment-bloat` and `comment-restates-code` judge a comment against the code
  under it, so `rules-comments.mjs` reads the blanked source, not the raw file.
  A blanked line is whitespace exactly where a comment was, which is how a
  standalone comment is told from a trailing one and how a block's subject is
  found. Hand it the raw source and every comment reads as code.
- Point `--root` at the repository, not at the target directory. Manifest
  files such as Godot scenes are collected from the root, and a scene that
  wires a class usually sits above the scanned subdirectory.
- Declare harness directories with `--test-path`. Without it the scanner reads
  test-support code as production code that only tests call.
- `rust-linter.mjs` and `csharp-linter.mjs` only run when the repository root
  has a `Cargo.toml` or a `.sln`/`.csproj`. Outside one they return no
  findings, the same as a timeout or a missing binary. A quiet write there is
  not proof the crate or solution is clean.
- The fixture corpus at `skills/quality-refactor/scripts/lib/target/` holds
  one realistic file per supported language, checked by
  `language-fixtures.test.mjs`. It sits in a directory literally named
  `target` on purpose: that name is in the scanner's own `IGNORED_DIRS`
  (`config.mjs`), which is the only reason the corpus never trips the
  structural ratchet or the per-write hook. Rename the directory and both
  start scanning deliberately bad fixture code as a real regression.
