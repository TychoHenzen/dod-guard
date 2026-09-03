## MODIFIED Requirements

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
