## Purpose

Puts the four skills that ran outside OpenSpec onto a change id: `/ratchet`,
`/adversarial-workflow`, `/blind-rewrite` and `/tighten`. Each one writes its
artifacts to that change and closes on the same trace and archive gate the
executor uses.

## ADDED Requirements

### Requirement: every executing skill takes a change id

`/ratchet`, `/adversarial-workflow`, `/blind-rewrite` and `/tighten` SHALL each
take a change id and resolve the `dod_id` from it, rather than starting from a
bare `dod_id` or from no identifier at all.

#### Scenario: A skill starts a run
- **WHEN** any of the four skills starts
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=change-scoped` exits
  0, having found a change id in each skill's starting inputs

### Requirement: the closing gate is shared

`/ratchet` and `/adversarial-workflow` SHALL close a green run with
`dod-guard trace <change-id>` followed by `openspec archive <change-id> --yes`,
the same order `/step-by-step` uses. A non-zero trace SHALL stop the run before
archiving.

#### Scenario: A ratchet run reaches its finish
- **WHEN** every concrete leaf passes and only `MANUAL:` drafts remain
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=closing-gate` exits
  0, having found trace before archive in both skills

#### Scenario: A leaf traces to no scenario
- **WHEN** `dod-guard trace <change-id>` exits 1
- **THEN** the skill reports the untraced leaf and does not archive

### Requirement: no skill claims interview calls dod_create

`/ratchet` and `/adversarial-workflow` SHALL describe `/interview` as writing
an OpenSpec change and generating the DoD from it.

#### Scenario: A skill describes where its DoD came from
- **WHEN** either skill explains its starting point
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=no-legacy-fallback`
  exits 0

### Requirement: the rewrite contract is a spec delta

`/blind-rewrite` SHALL write the contract for a code target as the change's
spec delta under `openspec/changes/<id>/specs/`, before deletion rather than
after the rewrite. `.blind/` SHALL hold only the quarantined original.

#### Scenario: A code target is contracted
- **WHEN** the skill extracts a contract for a shape A, B or C target
- **THEN** the contract lands under `openspec/changes/<id>/specs/` and `.blind/`
  holds no contract file

#### Scenario: The contract uses OpenSpec's own keywords
- **WHEN** the skill states which RFC 2119 keyword a requirement takes
- **THEN** it names SHALL or MUST and avoids should and may, matching the
  `specs` artifact instruction

### Requirement: a tighten target is a change

`/tighten` SHALL open a change for each target it picks. `.tighten/ledger.json`
SHALL remain the scanner queue, and a target SHALL count as accepted when its
change archives rather than when the ledger says so.

#### Scenario: The loop picks a target
- **WHEN** `pick-target.mjs` returns a target
- **THEN** the skill opens a change for it before any rewrite starts

#### Scenario: A target is accepted
- **WHEN** a target's gates pass
- **THEN** its change archives, and the ledger records the outcome without
  defining a second completion vocabulary
