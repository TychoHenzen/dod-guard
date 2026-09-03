## Why

LLM-assisted prototyping can leave abandoned implementations technically reachable through fallbacks and conditional wiring. Static dead-code analysis therefore misses them, while their shared commit history still shows where prototype work consolidated and which files went quiet.

## What Changes

- Add the `@dod-guard/fossil` CLI package and a programmatic repository-analysis API.
- Detect prototype bursts from Git history using temporal gaps and sustained file-set changes.
- Separate burst survivors from existing files whose post-burst activity stopped.
- Analyze current TypeScript, JavaScript, C#, and Rust references, including weak fallback references and vestigial fossil-to-fossil links.
- Grade fossil candidates from churn, abandonment, reference weakness, and cluster isolation.
- Report possible stale untracked or ignored workspace debris as a separate review category.
- Provide stable table and versioned JSON output suitable for later `/detect-fossils` and `/trim-fossils` skills.

## Capabilities

### New Capabilities

- `fossil/burst-analysis`: Git history parsing, prototype burst detection, rename-aware file activity, and survivor classification.
- `fossil/reference-analysis`: Replaceable language reference parsing and strong, weak, or vestigial reference grading.
- `fossil/scoring`: Fossil subscore calculation, missing-signal normalization, and burst-level result assembly.
- `fossil/cli`: Command-line and programmatic interfaces, validation, table output, JSON output, and exit behavior.
- `fossil/workspace-debris`: Separate detection and reporting of old untracked or ignored files without discovered usage evidence.

### Modified Capabilities

None.

## Impact

- Adds a new npm workspace under `packages/fossil` and the `fossil` executable.
- Adds `commander` as the package's only production dependency.
- Extends root build, bundle, test, coverage, lint, lockfile, and package-validation integration for a CLI-only workspace.
- Establishes an API and JSON contract that later fossil detection and trimming skills can consume.
