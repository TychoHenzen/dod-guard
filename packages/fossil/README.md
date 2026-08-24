# fossil

`@dod-guard/fossil` is a Node 18+ command-line workspace for reviewing bursty Git activity,
current-code reference evidence, and old workspace files. It is not an MCP server or marketplace plugin.

Every fossil and workspace-debris finding is advisory. Fossil never deletes, renames, stages, or otherwise
mutates repository files.

## Build and run from this workspace

Run these commands from the monorepo root:

```sh
npm install
npm run build -w packages/fossil
npm run bundle -w packages/fossil
node packages/fossil/dist/bundle.js --help
node packages/fossil/dist/bundle.js analyze .
```

The package scripts are `build`, `test`, `bundle`, `start`, `coverage`, and `dev`. For example,
`npm run start -w packages/fossil -- analyze . --format json` runs the bundled CLI.

The command surface and report types are in place. This checkout does not yet wire a production
repository-analysis core, so a real `analyze` command can report an analysis failure rather than a completed
report. The examples below describe the CLI contract and do not claim that full repository analysis has been
verified here.

## Commands and options

```sh
# Human-oriented table output
fossil analyze ./my-repository

# One schema-versioned JSON document
fossil analyze ./my-repository --format json

# Configure a focused analysis
fossil analyze ./my-repository \
  --days 180 --gap-hours 72 --threshold 0.60 \
  --extensions ts,tsx,js --untracked-age 120 \
  --exclude 'generated/**,.cache/**' --verbose
```

`repo-path` is optional. When omitted, fossil uses the current working directory.

| Option | Default | Valid values | Meaning |
| --- | --- | --- | --- |
| `--days <days>` | `90` | finite `1..3650` | Git-history window in days. |
| `--gap-hours <hours>` | `48` | finite `1..8760` | Inactivity gap used to close a burst. |
| `--threshold <score>` | `0.4` | finite `0..1` | Inclusive finding threshold. A score equal to it is reported. |
| `--format <format>` | `table` | `table` or `json` | Output format. |
| `--extensions <list>` | all extensions | Up to 64 trimmed, comma-separated values | Candidate-history extension filter. An empty list means no extension filter. |
| `--untracked-age <days>` | `90` | finite `1..3650` | Minimum modification age for workspace-debris evaluation. |
| `--exclude <patterns>` | none | Comma-separated repository-relative `*`, `?`, and `**` patterns | Exclusions applied before workspace metadata access. |
| `--verbose` | `false` | flag | Adds candidate evidence detail and keeps individual ignored-debris rows in table views. |

Unknown options and extra positional arguments are usage errors.

## Reading fossil scores

Fossil scores evidence. It does not decide whether a file is safe to remove.

When reference analysis is complete, the full score is:

```text
0.30 * churn + 0.35 * abandonment + 0.20 * reference weakness + 0.15 * cluster isolation
```

Churn is normalized within the burst. Abandonment falls as later commits grow relative to burst commits.
Reference weakness is `1` for no strong live inbound reference, `0.5` for one, and `0` for two or more.
Cluster isolation is the fraction of resolved neighbors that are also candidates.

When both reference subscores are unavailable, fossil reports a `git-only` score:

```text
(0.30 / 0.65) * churn + (0.35 / 0.65) * abandonment
```

Otherwise, the score basis is `full`. A finding is included when `score >= threshold`. The same path can have
separate findings in different bursts because each burst has independent evidence.

## JSON schema version 1

`--format json` writes one JSON document with `schemaVersion: 1`. It contains report data, not table prose or
source content.

| Field | Contents |
| --- | --- |
| `schemaVersion` | Report schema version, currently `1`. |
| `options` | Normalized analysis options used for the report. |
| `analysisTimestampMs`, `gitVersion` | Captured analysis time and Git version evidence. |
| `boundary` | Repository root, canonical root, and unobserved mechanisms. |
| `limits`, `usage` | Applied resource limits and observed resource consumption. |
| `completeness` | History, reference-analysis, and workspace-debris completeness flags. |
| `statistics` | Commit, file, burst, finding, unique-path, and workspace-debris totals. |
| `warnings` | Nonfatal warning objects, sorted by code and path. |
| `bursts` | Burst context, survivors, advisory fossil findings, and deleted paths. |
| `workspaceDebris` | Separate advisory workspace-debris findings. |

Candidate finding totals count burst-path rows. Unique candidate path totals normalize slash and backslash forms
before counting.

## Reference evidence

Fossil recognizes these repository-contained static reference forms:

- TypeScript and JavaScript: literal relative `import`, `require`, and dynamic `import()` specifiers.
- C#: namespace-level `using` references when the resolved `.cs` suffix is unique.
- Rust: `mod name;` and `use crate::...` references from Cargo `src` trees.

It does not treat dynamic runtime loading, reflection, runtime path construction, generated configuration,
external consumers, sibling repositories, package specifiers, package exports, TypeScript path aliases, or other
unsupported language forms as proof of inbound use. Missing, unreadable, unstable, oversized, or binary reference
sources make affected reference evidence unavailable instead of turning it into abandonment evidence.

## Limits and outcomes

Fossil requires Git 2.30 or later. A completed analysis can succeed with zero findings and with nonfatal warnings.

| Limit | Value | Result when exceeded |
| --- | --- | --- |
| Included commits | `100,000` | Fatal resource-limit failure. |
| Current inventoried files | `100,000` | Fatal resource-limit failure. |
| Git file-status records | `1,000,000` | Fatal resource-limit failure. |
| Git stdout / stderr | `256 MiB` / `1 MiB` | Fatal resource-limit failure. |
| Reference content per file / total | `1 MiB` / `256 MiB` | Nonfatal omitted reference evidence and warnings. |

Exit codes are `0` for a completed analysis, including zero findings and nonfatal warnings, `1` for repository or
analysis failures, and `2` for command usage or invalid options.

## Review-only workspace debris

Workspace-debris findings describe old regular untracked or ignored files with no discovered inbound usage evidence.
They use modification time, not a claim of file age or obsolescence. Copying, restoring, extracting, or rebuilding a
file can change that time.

Fossil excludes dependency stores, sensitive paths, links and junctions, and caller-excluded paths before workspace
inspection. A reported item still needs review and a fresh local check before any separate manual action. Neither a
fossil finding nor a workspace-debris finding grants deletion authority.
