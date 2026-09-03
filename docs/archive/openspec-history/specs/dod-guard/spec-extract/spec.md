# dod-guard/spec-extract Specification

## Purpose

Extracts an exhaustive OpenSpec-format behavioral spec from a code or prose target without deleting or quarantining the original.

## Requirements

### Requirement: target classification
The skill SHALL classify the target as code or prose. Code targets have a file extension associated with a programming language or a shebang line. All other targets are prose.

#### Scenario: source file classified as code
- **WHEN** the user provides a file with a recognized code extension (`.ts`, `.cs`, `.cpp`, `.rs`, `.html`, `.py`, or similar)
- **THEN** the skill classifies it as code and dispatches `blind-contract-extractor`

#### Scenario: file with no recognized code extension classified as prose
- **WHEN** the user provides a `.md` file as the target
- **THEN** the skill classifies it as prose and dispatches `blind-prose-contract-extractor`

### Requirement: code extraction via blind-contract-extractor
For code targets, the skill SHALL dispatch `blind-contract-extractor` with the target path. The skill SHALL transform each behavior in the agent's report into a `### Requirement:` block with RFC 2119 keywords. Each testable case SHALL become a `#### Scenario:` block with GIVEN/WHEN/THEN structure.

#### Scenario: boundary and behaviors extracted from a module
- **WHEN** the skill dispatches `blind-contract-extractor` on a module with three public functions
- **THEN** the output contains one requirement per function, each with at least one scenario, and the boundary signatures appear verbatim

#### Scenario: REQUIRED and OBSERVED tags preserved
- **WHEN** the extractor tags a behavior as REQUIRED with a test citation
- **THEN** the output requirement carries the REQUIRED tag and the citation

#### Scenario: OBSERVED items included with tag
- **WHEN** the extractor tags a behavior as OBSERVED
- **THEN** the output requirement carries the OBSERVED tag so a human reviewer can decide whether to keep it

### Requirement: prose extraction via blind-prose-contract-extractor
For prose targets, the skill SHALL dispatch `blind-prose-contract-extractor` with the target path. The skill SHALL transform each claim in the agent's report into a `### Requirement:` block with the claim's strength word. Each testable case SHALL become a `#### Scenario:` block.

#### Scenario: claims extracted from a documentation page
- **WHEN** the skill dispatches `blind-prose-contract-extractor` on a README
- **THEN** the output contains one requirement per claim with the recorded strength word

#### Scenario: verbatim text preserved
- **WHEN** the extractor identifies verbatim text (quotations, proper names, defined terms)
- **THEN** the output carries the verbatim text in a dedicated section for overlap-gate exemption

### Requirement: output written as spec file
The skill SHALL write the extracted spec to a file path the caller specifies, or to a default path derived from the target's location. The file SHALL be valid OpenSpec spec format with a `## Purpose` section followed by `### Requirement:` blocks.

#### Scenario: caller specifies output path
- **WHEN** the caller provides an output path
- **THEN** the skill writes the spec to that path

#### Scenario: default output path derived from target
- **WHEN** the caller does not provide an output path
- **THEN** the skill writes the spec to a `.spec-extract/` directory beside the target, named `<target-stem>.spec.md`

### Requirement: usage census and leak list included
The skill SHALL include the usage census and the leak list as appendix sections in the output. The usage census covers call sites, option keys, return fields consumed, and errors caught. The leak list covers copies of the target in build output, rendered docs, and snapshots. These sections are informational and do not carry RFC 2119 keywords.

#### Scenario: usage census lists call sites
- **WHEN** the target has three call sites across two files
- **THEN** the usage census in the output lists all three call sites and the fields each one consumes

#### Scenario: leak list identifies build output copies
- **WHEN** the target has a compiled copy in a build output directory (`dist/`, `bin/`, `target/`, `obj/`, or similar)
- **THEN** the output's leak list section names that path

### Requirement: banned vocabulary included
The skill SHALL include the banned vocabulary list (interior identifiers, algorithm names) as an appendix section. This list is consumed by workflows that need to prevent the original's naming from leaking into a replacement.

#### Scenario: interior helper names listed
- **WHEN** the target defines three helper functions that no caller outside the module reaches
- **THEN** the banned vocabulary section lists all three names

### Requirement: existing OpenSpec spec merged
When the target's capability already has a spec under `openspec/specs/`, the skill SHALL merge the existing spec's REQUIRED claims into the output. Claims that appear in both the existing spec and the extractor's output are kept once, tagged REQUIRED. Claims the extractor found that the spec does not carry are tagged OBSERVED.

#### Scenario: existing spec claims merged
- **WHEN** the target has a spec at `openspec/specs/dod-guard/foo/spec.md` with two requirements
- **THEN** the output carries those two requirements tagged REQUIRED regardless of what the extractor found

#### Scenario: new behavior tagged OBSERVED
- **WHEN** the extractor finds a behavior the existing spec does not mention
- **THEN** the output carries it tagged OBSERVED

### Requirement: no deletion or quarantine
The skill SHALL NOT delete, move, or quarantine the target. The original file remains at its location, unchanged.

#### Scenario: target file unchanged after extraction
- **WHEN** the skill completes
- **THEN** the target file's content and path are identical to before the skill ran
