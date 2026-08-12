## ADDED Requirements

### Requirement: the dod instruction carries the authoring policy

The schema's `dod` artifact instruction SHALL carry the rules a generated DoD
is amended against: the predicate types, the proof categories, the company
baseline procedure, the integration proof pair, the `MANUAL:` inspection leaf
triggers, and the test-first leaf pair. It SHALL NOT be a placeholder.

#### Scenario: An agent asks for the dod rules
- **WHEN** `openspec instructions dod --change <id>` runs against a change
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=dod-instruction`
  exits 0, having found every predicate type and every proof category in the
  schema's `dod` instruction

#### Scenario: The placeholder is gone
- **WHEN** the schema's `dod` artifact instruction is read
- **THEN** it contains no text describing itself as a placeholder or as
  landing in a later migration step

### Requirement: a leaf keeps its scenario name through the round trip

`dod_generate` renders the converted tree to markdown and reads it back through
the parser. A concrete leaf SHALL carry its `#### Scenario:` heading through
that round trip as its title. The renderer SHALL write that title and the
parser SHALL read it, instead of substituting the leaf's THEN text.

#### Scenario: A generated leaf is inspected in storage
- **WHEN** `dod_generate` runs against a change whose scenario is named
  "Leaves convert in order"
- **THEN** `node --test packages/dod-guard/dist/title-round-trip.test.js`
  exits 0, covering a rendered concrete leaf that carries its title

#### Scenario: The parser reads a rendered leaf back
- **WHEN** a rendered concrete leaf is parsed
- **THEN** `node --test packages/dod-guard/dist/title-round-trip.test.js`
  exits 0, covering a leaf whose title is the scenario heading and whose
  description is the THEN text

### Requirement: a removed requirement produces no proof

The converter SHALL read the `## ADDED`, `## MODIFIED`, `## REMOVED` and
`## RENAMED` headings that group a delta's requirements. A requirement under
`## REMOVED Requirements` SHALL produce no group and no leaf, because deleted
behavior is not something the work has to prove.

#### Scenario: A delta removes a requirement
- **WHEN** `dod_generate` runs against a delta holding a `## REMOVED
  Requirements` section
- **THEN** `node --test packages/dod-guard/dist/openspec/delta-sections.test.js`
  exits 0, covering a tree with no node for the removed requirement

#### Scenario: A removed requirement would otherwise never be satisfiable
- **WHEN** a removed requirement reaches the tree as a draft
- **THEN** it holds the document at INCOMPLETE forever, since no work can
  satisfy a requirement that was deleted

### Requirement: regeneration refreshes the leaf title

`dod_amend` SHALL accept a new title, and the regeneration path SHALL pass one
whenever a scenario's heading or text changed. A leaf SHALL NOT keep a title
from a scenario version that no longer exists.

#### Scenario: A scenario's THEN line is rewritten and the DoD regenerated
- **WHEN** a scenario changes and `dod_generate` runs again
- **THEN** `node --test packages/dod-guard/dist/title-round-trip.test.js`
  exits 0, covering an amended leaf whose title matches the current scenario

#### Scenario: A stale title would reach the step plan
- **WHEN** `dod-guard steps <change-id>` runs after a regeneration
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering step titles that match the current scenario headings

### Requirement: the generated document is never hand-written

The `dod` instruction SHALL direct the agent to produce the document with the
`dod_generate` tool and to change it only through `dod_amend`, `dod_refine` and
`dod_add_node`.

#### Scenario: An agent is told how to build the document
- **WHEN** the `dod` instruction is followed
- **THEN** it names `dod_generate` as the producer and forbids editing the
  rendered `dod.md` by hand, because every write regenerates that file from
  canonical storage
