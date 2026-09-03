# dod-guard/blind-rewrite Specification

## Purpose
Skill that replaces an implementation by deleting it first, then rebuilding from a contract that a fresh agent receives without ever seeing the old code. The blind author works from behavior descriptions alone, so inherited complexity cannot leak back in.

## Requirements

### Requirement: 4 rewrite shapes
The skill SHALL classify each target into one of 4 shapes: A (new interior, seam exists - tests cover the boundary), B (no seam yet - create the seam sighted first), C (dependency swap - replace one dependency with another across call sites), D (prose, no test harness). The shape determines which phases run and which agents are dispatched.

#### Scenario: shape A rewrites interior behind existing seam
- **WHEN** the target sits behind a public boundary such as a function signature or API
- **THEN** the skill deletes and rebuilds only the interior, keeping the boundary intact

#### Scenario: shape B creates seam before rewrite
- **WHEN** the target has no existing public boundary
- **THEN** the skill creates the seam sighted with tests for the boundary, then proceeds as shape A

#### Scenario: shape C dispatches per call site
- **WHEN** the target is a dependency swap across multiple call sites
- **THEN** the skill dispatches one migration step per call site via `step-by-step`

#### Scenario: shape D uses claim-based verification
- **WHEN** the target is prose with no test harness
- **THEN** the skill verifies through claim coverage, gap audit, and the prose overlap gate

### Requirement: contract extraction before deletion
The skill SHALL invoke the `/spec-extract` skill with the target path to produce the behavioral contract. `/spec-extract` dispatches `blind-contract-extractor` (for code) or `blind-prose-contract-extractor` (for prose) and returns the result as an OpenSpec-format spec. The skill SHALL consume that output as the contract for all later phases. The contract SHALL describe behavior in terms of inputs, outputs, and observable effects, never quoting the interior implementation.

#### Scenario: contract describes behavior, not code
- **WHEN** the extractor analyzes a sorting function
- **THEN** the contract describes input/output pairs and stability guarantees, not the algorithm used

#### Scenario: OpenSpec spec exists for the target
- **WHEN** the target's capability has an existing spec or active change
- **THEN** the REQUIRED claims come from the spec verbatim rather than from the extractor's read

#### Scenario: prose target uses prose extractor
- **WHEN** the target is prose
- **THEN** `/spec-extract` dispatches `blind-prose-contract-extractor` with claim strength words instead of RFC 2119 keywords

#### Scenario: contract screened against banned vocabulary
- **WHEN** the contract contains interior names or algorithm names
- **THEN** the skill strips them before passing the contract to the author

#### Scenario: extraction delegated to spec-extract skill
- **WHEN** the skill reaches Phase 2
- **THEN** it invokes `/spec-extract` with the target path and reads the output file, rather than dispatching an extractor agent directly

### Requirement: original quarantined, then deleted
The skill SHALL save the original to a quarantine location before deleting it from the working tree. The blind writer SHALL NOT have access to the quarantine. Deletion SHALL happen so it is reversible.

#### Scenario: quarantine before delete
- **WHEN** the skill reaches the quarantine phase
- **THEN** it copies the target to `.blind/quarantine/` and removes the original from its working location

#### Scenario: leak paths sealed before author dispatch
- **WHEN** the skill prepares for the author dispatch
- **THEN** it records every copy of the target the author could reach, including build output, rendered docs, and permanent banned paths

#### Scenario: permanent banned paths always included
- **WHEN** the skill builds the banned paths list
- **THEN** it includes `~/.claude/plugins/cache/dod-guard/` and `~/.claude/plugins/marketplaces/dod-guard/`

### Requirement: blind writer receives contract only
The `blind-writer` (for code) or `blind-prose-writer` (for prose) SHALL receive the contract, the target's file path, and any conventions or type signatures from the surrounding code. It SHALL NOT receive the original source, the quarantine path, or any diff of the old implementation.

#### Scenario: writer has no access to original
- **WHEN** the blind writer is dispatched
- **THEN** its prompt contains the contract and boundary types but no quoted lines from the original

#### Scenario: large target dispatched in multiple calls
- **WHEN** the target is too large for a single dispatch
- **THEN** the skill sends several calls, each able to read earlier output from the same run

#### Scenario: prose target dispatched to prose writer
- **WHEN** the target is prose
- **THEN** the skill dispatches `blind-prose-writer` instead of `blind-writer`

### Requirement: overlap gate rejects cosmetic rewrites
The skill SHALL run `overlap-scan.mjs` on the old and new implementations. Exit 0 means the rewrite is genuinely different. Exit 1 means the rewrite is cosmetically similar to the original and the skill SHALL redispatch the writer once with adjusted instructions. A second exit 1 fails the rewrite.

#### Scenario: overlap gate passes on first attempt
- **WHEN** `overlap-scan.mjs` returns exit 0 on the first check
- **THEN** the skill proceeds to the gap audit

#### Scenario: first overlap check fails
- **WHEN** `overlap-scan.mjs` returns exit 1 on the first attempt
- **THEN** the skill redispatches the blind writer saying only "too close," with no metric names or scores

#### Scenario: second overlap check fails
- **WHEN** `overlap-scan.mjs` returns exit 1 on the redispatch
- **THEN** the skill stops the rewrite and reports two completed rewrites converged on the same design

#### Scenario: target below minimum evidence threshold
- **WHEN** the target has fewer than roughly 40 significant tokens
- **THEN** the gate abstains and the orchestrator reads the change manually

### Requirement: gap audit catches dropped behavior
The skill SHALL dispatch `blind-gap-auditor` to compare the replacement against the original (read from quarantine). The auditor reports only behavior or claims the rewrite dropped. Style differences and design preferences SHALL NOT count as gaps.

#### Scenario: auditor finds dropped error handling
- **WHEN** the original handled a specific error case and the rewrite does not
- **THEN** the gap auditor reports the missing error handling as a behavioral gap

#### Scenario: style difference rejected as a gap
- **WHEN** the auditor notes a design preference or style difference between old and new
- **THEN** the auditor does not report it, because difference is the goal

#### Scenario: gap repaired as a sighted edit
- **WHEN** the gap auditor reports a behavioral gap
- **THEN** the skill fixes the gap as a sighted edit, not through a blind redispatch

### Requirement: tests must pass on the replacement
After the blind writer produces the replacement, the skill SHALL run the full test suite (existing tests for shape A, boundary tests for shape B). All tests SHALL pass before the overlap and gap gates run.

#### Scenario: test failure on replacement
- **WHEN** an existing test fails against the blind-written replacement
- **THEN** the skill feeds the failure back to the blind writer for repair without showing the original

#### Scenario: all tests pass
- **WHEN** every test passes against the replacement
- **THEN** the skill proceeds to the overlap gate

#### Scenario: shape D checks claim coverage at recorded strength
- **WHEN** the target is prose and all claims carry a strength word
- **THEN** the skill checks each REQUIRED claim at its recorded strength rather than running a test suite

### Requirement: OpenSpec integration for code contracts
When the repo has `openspec/`, the skill SHALL compare the gap-audited contract against what `openspec show` returned. A REQUIRED claim the spec did not carry is existing behavior newly documented, not new behavior. It SHALL be recorded as a delta under `openspec/changes/`.

#### Scenario: new REQUIRED claim written as delta
- **WHEN** the gap-audited contract has a REQUIRED claim that the existing spec does not carry
- **THEN** the skill writes it as a delta under the change's `specs/` directory

#### Scenario: active change already covers the capability
- **WHEN** an active change already covers the target's capability
- **THEN** the skill appends the new claim to that change's spec delta

#### Scenario: spec already carries every REQUIRED claim
- **WHEN** every REQUIRED claim in the contract already exists in the spec
- **THEN** the skill writes no OpenSpec delta
