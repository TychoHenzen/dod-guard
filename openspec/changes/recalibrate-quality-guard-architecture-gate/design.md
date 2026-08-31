## Context

The package has one zero-dependency scanner, a plain-MJS PostToolUse hook, and a TypeScript MCP server. The scanner and hook operate primarily on files. CI compares repository-wide rule counts against a tracked baseline. The package executable currently starts the MCP transport, while the package `bin` already points at the same bundle.

The current write hook is intentionally fail-open and can edit the tracked quality baseline. The commit decision needs the opposite reliability boundary: it must inspect the exact staged content, report incomplete analysis, and be reproducible in CI. See `proposal.md` for the product motivation and the delta specs for observable behavior.

## Goals / Non-Goals

**Goals:**

- Keep the current scanner as the local mechanical measurement layer.
- Add deterministic staged snapshots, dependency evidence, and architecture review evidence without external runtime dependencies.
- Give CLI, MCP, local hooks, and CI one decision core.
- Separate provable failures from evidence that needs architectural judgment.
- Make refactor plans describe desired ownership before they describe edits.

**Non-Goals:**

- Infer business-domain meaning with a language model inside the gate.
- Replace compiler, formatter, linter, test, security, or OpenSpec behavior checks.
- Install or modify a consumer repository's Git hooks automatically.
- Reject every method addition, public export, or large directory without context.
- Rewrite existing quality baselines during a write or staged decision.

## Decisions

### 1. Use three quality boundaries

The PostToolUse hook remains a fast file-local guard. The staged gate becomes the authoritative local commit decision. CI reconstructs and replays the same decision from a commit and its first parent.

This keeps write latency bounded and avoids pretending a file hook can judge reachability or architecture. The staged gate fails closed when required evidence cannot be collected. The write hook remains fail-open on internal errors because a broken editor hook must not stop work.

Alternative considered: run repository analysis after every write. Rejected because project graph and Git-history analysis would add high latency, and intermediate edits are often intentionally incomplete.

### 2. Read a virtual staged tree

Add a snapshot abstraction with two implementations: Git index against `HEAD` for local use, and committed tree against first parent for CI. It enumerates changes with NUL-delimited Git output and reads each version from Git objects rather than the working tree. Rename detection is normalized into before and after paths before analysis.

The decision fingerprint hashes the base identity, staged source paths, staged source bytes, and quality configuration. It excludes only the architecture decision record, so adding an acknowledgement does not invalidate itself. Any source or configuration change creates a new fingerprint.

Alternative considered: stash unstaged edits and scan the filesystem. Rejected because it mutates user state and creates recovery risk.

### 3. Build evidence, not semantic verdicts

Extend the scanner parsing boundary so architecture analysis can obtain top-level types, members, public symbols, imports, and source references for each supported language. Build a production dependency graph from those facts and existing manifest references.

The analysis emits these evidence families:

| Family | Evidence | Decision class |
|---|---|---|
| Responsibility growth | Added members, fields, imports, public members, and dependencies on an existing type | review |
| Placement | Direct production-type count and generic-bucket additions | review |
| Boundaries | Forbidden dependency edges and introduced cycles | fail |
| Encapsulation | Public-surface growth, test-only seams, and forwarding compatibility paths | review, or fail when an existing deterministic rule applies |
| Locality | Bounded Git co-change counts for the affected structural unit | review |
| Structural progress | Ownership, dependency, placement, public-surface, and deletion deltas | review for absent progress under refactor intent |
| Local structure | Existing scanner errors and baseline regressions | fail |

Review findings provide facts and never assert that an addition is inherently wrong. The gate does not ask the same model that authored the change to classify its own architecture silently.

Alternative considered: hard-fail every new method on an existing class. Rejected because extending the correct owner is normal and cannot be distinguished by syntax alone.

### 4. Use explicit repository configuration with conservative defaults

Add an optional `.quality-guard.json` configuration. It can declare path groups, allowed dependency directions, direct-type limits, generic directory names, generated paths, test-support paths, and history settings.

Without configuration, the analyzer still detects cycles, structural growth, public-surface growth, and placement pressure. The default placement review threshold is 12 direct production types. Default generic buckets are `utils`, `common`, `helpers`, `shared`, and `misc`. Locality reads at most 200 first-parent commits and reports its counts without failing.

Unknown configuration keys and invalid path-group references are usage errors for the staged command. This avoids a misspelled boundary creating a false clean verdict.

Alternative considered: infer domains and layers from folder names. Rejected because naming conventions vary and an inferred forbidden edge is not a proof.

### 5. Keep one decision core and thin adapters

Create a TypeScript decision core under `packages/quality-guard/src/commit-gate/`. Keep one type per file and keep adapters outside the core:

- The package bundle dispatches `check` and `acknowledge` subcommands before starting MCP stdio.
- The MCP `quality_commit_gate` tool calls the same core and renders its result as text.
- CI invokes the bundled command with an internal committed-tree source option.
- A repository may wire `quality-guard check --staged` into its own pre-commit system, but installation remains the repository owner's choice.

The core returns a typed result holding verdict, fingerprint, findings, errors, and input summary. Renderers map that result to stable text, JSON, MCP content, and process exit codes.

Alternative considered: add a second plain-MJS staged gate beside the MCP implementation. Rejected because the two decisions would drift.

### 6. Store review acknowledgements as tracked evidence

Use `.github/quality/architecture-decisions.json` as an append-only tracked record. Each entry holds finding identifier, staged fingerprint, reason, author, and time. `quality-guard acknowledge` reads the current staged report and refuses unknown or deterministic finding identifiers.

The staged and CI gates consider only entries matching the current fingerprint and finding identifier. They report stale entries but do not accept them. The existing `.quality-skip` log remains limited to write-time waivers and does not acknowledge architecture findings.

Alternative considered: store acknowledgement outside Git. Rejected because CI and reviewers could not reproduce the local decision.

### 7. Refactor planning starts with a target structure

Revise the quality-refactor skill so Phase 1 produces a responsibility map and desired ownership map before scanner work units become tasks. Scanner units remain evidence and a source of local cleanup after structural moves.

Tasks are grouped by an independently runnable structural outcome. A task may change an owner, its callers, and its tests together when splitting that work would leave the repository unusable. The final report compares architectural and scanner evidence with the initial state. Cosmetic or local-only improvement cannot satisfy an architectural outcome.

Alternative considered: keep one task per file and add stronger wording. Rejected because the task boundary itself anchors the executor to existing files.

## Risks / Trade-offs

- [Regex-based parsing can miss language constructs] -> Keep findings evidence-based, add one realistic fixture per language, and fail the staged decision when a required changed file cannot be parsed.
- [Responsibility findings may be noisy] -> Keep them review-only, show exact additions, and let repository configuration narrow paths and thresholds.
- [Git-history locality can penalize new modules] -> Report the history sample and never make locality a deterministic failure.
- [A tracked decision log can grow] -> Keep entries compact and add a later maintenance command if real growth warrants it. Do not add retention behavior without a spec.
- [CI does not have a staged index] -> Use the same snapshot interface with the committed tree and first parent, then test local and CI sources against identical fixtures.
- [Stricter new-file bounds can interrupt large generated fixtures] -> Preserve explicit generated-file and file-header exemptions. Require test-support paths to be declared rather than silently adopting the file.
- [Cross-language architecture extraction expands scanner complexity] -> Reuse existing parsed units and isolate language-specific extraction behind small fact adapters.

## Migration Plan

1. Add staged snapshot, configuration, fingerprint, evidence, and decision types behind tests without wiring a public command.
2. Add architecture analyzers and cross-language fixtures. Compare reports for deterministic ordering.
3. Add CLI rendering, acknowledgement storage, and process exit behavior.
4. Add the MCP adapter and prove it matches CLI results.
5. Change the PostToolUse gate to read baselines without writing them and apply normal hard bounds to new files.
6. Update the quality-refactor skill, references, and OpenSpec bindings.
7. Wire the repository CI replay after focused tests pass. Keep the previous structural ratchet during migration so rollback is removal of the new CI step.
8. Bundle the package and run plugin validation, package smoke, workspace tests, and strict OpenSpec validation.

No existing quality baseline migration is required. The architecture decision record starts as an empty tracked JSON array. Consumer repositories can add configuration and a local Git hook independently.
