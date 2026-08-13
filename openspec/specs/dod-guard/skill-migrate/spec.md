# dod-guard/skill-migrate Specification

## Purpose
Migrates a skill, agent definition, CLAUDE.md, memory file, or instinct file to post-4.6 Claude models. Blind-rewrites the artifact from a behavioral contract with scaffolding removed.

## Requirements

### Requirement: contract extraction via blind-prose-contract-extractor
The skill SHALL dispatch `blind-prose-contract-extractor` to extract the artifact's behavioral contract. For memory and instinct files, every factual assertion SHALL be marked Verbatim. The extractor receives the artifact's content, an inventory of its dependencies, and its kind.

#### Scenario: memory file extracts verbatim claims
- **WHEN** the target is a memory file that contains factual assertions
- **THEN** the contract marks every factual assertion as Verbatim

#### Scenario: skill artifact gets standard extraction
- **WHEN** the target is a SKILL.md
- **THEN** the contract extracts REQUIRED claims, OBSERVED claims, and a dependency census without marking all facts as Verbatim

### Requirement: classification separates essential from scaffolding
The skill SHALL dispatch `migration-analyst` to classify each OBSERVED item as ESSENTIAL, SCAFFOLDING, or ACCIDENTAL. For memory and instinct files, facts SHALL never be classified as SCAFFOLDING. The classification is advisory; the user decides what to cut.

#### Scenario: scaffolding identified in skill
- **WHEN** a SKILL.md contains verification instructions written for 4.6's literal compliance style
- **THEN** the migration-analyst classifies those instructions as SCAFFOLDING

#### Scenario: memory fact never classified as scaffolding
- **WHEN** the target is a memory file and a factual assertion is observed
- **THEN** the migration-analyst classifies it as ESSENTIAL or ACCIDENTAL, never SCAFFOLDING

#### Scenario: accidental items dropped automatically
- **WHEN** the migration-analyst classifies an item as ACCIDENTAL
- **THEN** the item is dropped without user confirmation

### Requirement: human gate before rewrite
The skill SHALL present the full REQUIRED list, tagged OBSERVED items, and the complete SCAFFOLDING list to the user. It SHALL collect which SCAFFOLDING to cut, which OBSERVED items are missed requirements, and whether any REQUIRED item is incorrect. The skill SHALL NOT proceed to the rewrite without user input.

#### Scenario: user promotes an OBSERVED item
- **WHEN** the user says an OBSERVED item classified as SCAFFOLDING is actually a requirement
- **THEN** the skill reclassifies it as REQUIRED and includes it in the blind writer's contract

#### Scenario: user cuts scaffolding items
- **WHEN** the user selects SCAFFOLDING items to remove
- **THEN** the pruned contract excludes those items from the blind writer's briefing

#### Scenario: user flags required claim as incorrect
- **WHEN** the user says a REQUIRED claim is wrong
- **THEN** the skill removes it from the contract before the blind writer dispatch

### Requirement: blind rewrite from pruned contract
The skill SHALL quarantine the original to `.skill-migrate/quarantine/original.md`, clear the artifact's body, and dispatch `blind-prose-writer` with the pruned contract. The writer never sees the original text. The 10 post-4.6 targets (cut to 50-70%, outcomes not methods, drop verification scaffolding, etc.) are included in the prompt.

#### Scenario: original quarantined before writer dispatch
- **WHEN** the skill is ready to rewrite
- **THEN** it saves the original to the quarantine path and clears the target file before dispatching

#### Scenario: memory file verbatim strings preserved
- **WHEN** the target is a memory file
- **THEN** the blind writer reproduces every Verbatim string exactly

#### Scenario: body length ceiling enforced
- **WHEN** the blind writer's output exceeds 70% of the source line count
- **THEN** the migration rejects the output as too long

### Requirement: four gates validate the result
The skill SHALL run four gates. The overlap gate runs `overlap-scan.mjs --mode=prose` (exit 0 genuine, exit 1 cosmetic). The gap audit dispatches `blind-gap-auditor` to find dropped claims. The regression gate runs `migration-check.mjs --before=baseline` (exit 0 pass, exit 1 regression, exit 3 kind mismatch). The claim coverage gate checks each REQUIRED and kept OBSERVED claim against the migrated text. One redispatch is allowed on overlap failure.

#### Scenario: overlap gate rejects cosmetic rewrite
- **WHEN** `overlap-scan.mjs --mode=prose` returns exit 1
- **THEN** the skill redispatches the blind writer once

#### Scenario: gap audit finds a dropped claim
- **WHEN** the gap auditor identifies a REQUIRED claim with no corresponding sentence
- **THEN** the skill reports the gap and does not mark the migration as complete

#### Scenario: regression gate fails
- **WHEN** `migration-check.mjs --before=baseline` exits 1
- **THEN** the skill fixes every regression before reporting

#### Scenario: cross-kind baseline comparison refused
- **WHEN** `migration-check.mjs --before` compares a baseline of a different kind
- **THEN** the script exits 3 and the skill reports the kind mismatch

#### Scenario: claim coverage finds unanchored claim
- **WHEN** a REQUIRED claim has no matching sentence in the migrated text
- **THEN** the skill sends the writer back with that claim identified

#### Scenario: memory file gap audit has no scaffolding exemption
- **WHEN** the gap auditor finds a dropped claim in a memory file
- **THEN** every dropped claim counts as a gap regardless of its classification

### Requirement: cap on agent dispatches
The skill SHALL dispatch at most 4 agents total across the entire migration. The four roles are: contract extractor, migration analyst, blind prose writer (up to 2 dispatches counting the redispatch), and gap auditor.

#### Scenario: redispatch consumes the gap auditor slot
- **WHEN** the blind writer is redispatched after an overlap gate failure
- **THEN** the total reaches 4 (extractor + analyst + 2 writer dispatches) and no slot remains for the gap auditor

#### Scenario: no redispatch needed
- **WHEN** the overlap gate passes on the first writer dispatch
- **THEN** the total is 4 (extractor + analyst + writer + gap auditor)
