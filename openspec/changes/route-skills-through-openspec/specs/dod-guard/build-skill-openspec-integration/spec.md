## REMOVED Requirements

### Requirement: steps derive from the DoD as a schema artifact

**Reason**: The dependency inverted. Blocking `steps` behind `dod` locks out
every change that legitimately has no spec delta, which is what a pure refactor
under `skip_specs: true` is. The replacement below depends on `tasks` instead.
The old scenario "Steps artifact blocked before dod completes" asserted the
blocking this change removes, so it cannot be carried forward. Its sibling also
claimed a step's title comes from the leaf's intent, where the converter has
always used the leaf's title.

**Migration**: A change that has a DoD behaves as before, because `dod` still
precedes `tasks` in practice. A change with no DoD now reaches `steps` and
derives them from `tasks.md`.

## ADDED Requirements

### Requirement: steps derive from the DoD and unblock on tasks

The schema SHALL define a `steps` artifact with `requires: [tasks]`. Its
converter SHALL turn each DoD leaf's proof command into a step's `verify_cmd`
and each leaf's title into the step title. A change that has no `dod.md` SHALL
derive its steps from `tasks.md` instead.

#### Scenario: Steps artifact blocked before tasks complete
- **WHEN** a change has not completed the `tasks` artifact
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=schema-steps-deps`
  exits 0, having found the `steps` artifact requiring `tasks` and not `dod`

#### Scenario: Change with no spec deltas still reaches steps
- **WHEN** a change sets `skip_specs: true` and has completed `tasks`
- **THEN** the artifact status for steps reports as not blocked, which a human
  confirms on the first refactor change that runs

#### Scenario: Leaf proof command becomes verify_cmd
- **WHEN** the `dod` artifact contains a leaf with a proof command
- **THEN** the generated `steps.json` contains one step whose `verify_cmd`
  is that proof command and whose title is the leaf's title

### Requirement: the executable plan lives in the change directory

`/step-by-step` and `/cheap-step` SHALL read and write the plan at
`openspec/changes/<id>/steps.json`. Neither SHALL read or write a plan under
`.step-session/`, and neither SHALL accept a plan file outside a change.

#### Scenario: No shipped file references the retired session directory
- **WHEN** the shipped skills and docs are searched for `.step-session`
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=no-step-session`
  exits 0

#### Scenario: The executor names the change directory as the plan home
- **WHEN** `/step-by-step` describes where the plan lives
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=plan-home` exits 0,
  having found `openspec/changes/<id>/steps.json` in the skill

#### Scenario: Caller supplies a bare plan file
- **WHEN** a user invokes `/step-by-step` with a markdown plan path and no
  change id
- **THEN** the skill routes the user to open a change first rather than
  executing the file

### Requirement: two progress records with separate jobs

`/step-by-step` SHALL keep both the `status` field in `steps.json` and the
checkbox in `tasks.md`, and SHALL state why: a checkbox cannot distinguish a
`blocked` step from a `skipped` one.

#### Scenario: A step ends blocked
- **WHEN** a step ends `blocked`
- **THEN** `steps.json` records `blocked` and that step's `tasks.md` line stays
  `- [ ]`

### Requirement: interview fetches artifact rules at run time

`/interview` SHALL obtain the DoD authoring rules from
`openspec instructions dod --change <id>` rather than carrying them in its own
text. No shipped SKILL.md SHALL contain a predicate table, a proof category
table, or a company baseline procedure.

#### Scenario: Interview reaches DoD generation
- **WHEN** `/interview` has proposed a change and needs to build the DoD
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=interview-fetches`
  exits 0, having found `openspec instructions dod` named in the skill

#### Scenario: No skill carries a second copy of the authoring rules
- **WHEN** the shipped skills are searched for a predicate or category table
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=no-authoring-copy`
  exits 0

### Requirement: no pre-OpenSpec fallback remains

`/interview` SHALL NOT offer `dod_create` as a fallback and SHALL NOT write a
plan to `docs/plans/`. A session with no OpenSpec change opens one.

#### Scenario: Skills are searched for the retired call
- **WHEN** every shipped SKILL.md is searched for `dod_create` and `docs/plans`
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=no-legacy-fallback`
  exits 0
