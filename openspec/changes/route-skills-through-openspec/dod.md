# route-skills-through-openspec - Requirements Spec

<claude_instructions>
**For the implementer:** Work through each task below.
1. Mark a task `[>]` when you begin working on it.
2. Call `dod_check` to verify proofs - do NOT mark proofs manually.
3. A task group is complete when ALL its concrete proofs pass via `dod_check`.
4. Use `dod_refine` to turn a draft leaf into a concrete proof or subdivide into child tasks.
5. If a proof cannot be met, use `dod_amend` to modify it with a reason.
6. Continue until `dod_check` returns PASS - then stop and report done.

**Behavioral predicates only.** Each proof is a concrete behavioral claim.
Read failure diagnoses carefully - they tell you WHAT went wrong and what to fix.
Proofs run on the HOST OS - write OS-correct commands (no bash on Windows).

**CWD:** `C:\Users\siriu\mcp-servers\dod-guard`

**Anti-cheat:** Proofs stored canonically in MCP storage.
`dod_check` executes commands from the canonical copy, not this markdown file.
</claude_instructions>

**Goal:** Definition of Done proof tree generated from the change's spec deltas

**Date:** 2026-08-12
**Target:** `C:\Users\siriu\mcp-servers\dod-guard`
**DoD ID:** `11768d9d-7be9-4768-87f2-94d61cfb3379`
**Last check:** INCOMPLETE (2026-08-12T19:00:24.437Z)

---

## Requirements

<requirements>
<requirements>
Generated from OpenSpec spec deltas.
</requirements>
</requirements>

---

## Definition of Done

<definition_of_done>

- [~] **Draft**: steps derive from the DoD as a schema artifact

### steps derive from the DoD and unblock on tasks [~]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=schema-steps-deps` -> `node scripts/ci/check-skill-hygiene.mjs --rule=schema-steps-deps` exits 0, having found the `steps` artifact requiring `tasks` and not `dod` <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10
  - [~] **Draft**: MANUAL: the generated `steps.json` contains one step whose `verify_cmd` is that proof command and whose title is the leaf's title
  - [~] **Draft**: MANUAL: the artifact status for steps reports as not blocked, which a human confirms on the first refactor change that runs

### the executable plan lives in the change directory [~]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=no-step-session` -> `node scripts/ci/check-skill-hygiene.mjs --rule=no-step-session` exits 0 <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10
  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=plan-home` -> `node scripts/ci/check-skill-hygiene.mjs --rule=plan-home` exits 0, having found `openspec/changes/<id>/steps.json` in the skill <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10
  - [~] **Draft**: MANUAL: the skill routes the user to open a change first rather than executing the file

### two progress records with separate jobs [~]

  - [~] **Draft**: MANUAL: `steps.json` records `blocked` and that step's `tasks.md` line stays `- [ ]`

### interview fetches artifact rules at run time [ ]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=interview-fetches` -> `node scripts/ci/check-skill-hygiene.mjs --rule=interview-fetches` exits 0, having found `openspec instructions dod` named in the skill <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10
  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=no-authoring-copy` -> `node scripts/ci/check-skill-hygiene.mjs --rule=no-authoring-copy` exits 0 <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10

### no pre-OpenSpec fallback remains [ ]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=no-legacy-fallback` -> `node scripts/ci/check-skill-hygiene.mjs --rule=no-legacy-fallback` exits 0 <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10

### every executing skill takes a change id [ ]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=change-scoped` -> `node scripts/ci/check-skill-hygiene.mjs --rule=change-scoped` exits 0, having found a change id in each skill's starting inputs <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10

### the closing gate is shared [~]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=closing-gate` -> `node scripts/ci/check-skill-hygiene.mjs --rule=closing-gate` exits 0, having found trace before archive in both skills <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10
  - [~] **Draft**: MANUAL: the skill reports the untraced leaf and does not archive

### no skill claims interview calls dod_create [ ]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=no-legacy-fallback` -> `node scripts/ci/check-skill-hygiene.mjs --rule=no-legacy-fallback` exits 0 <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10

### the rewrite contract is a spec delta [~]

  - [~] **Draft**: MANUAL: the contract lands under `openspec/changes/<id>/specs/` and `.blind/` holds no contract file
  - [~] **Draft**: MANUAL: it names SHALL or MUST and avoids should and may, matching the `specs` artifact instruction

### a tighten target is a change [~]

  - [~] **Draft**: MANUAL: the skill opens a change for it before any rewrite starts
  - [~] **Draft**: MANUAL: its change archives, and the ledger records the outcome without defining a second completion vocabulary

### the dod instruction carries the authoring policy [~]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=dod-instruction` -> `node scripts/ci/check-skill-hygiene.mjs --rule=dod-instruction` exits 0, having found every predicate type and every proof category in the schema's `dod` instruction <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10
  - [~] **Draft**: MANUAL: it contains no text describing itself as a placeholder or as landing in a later migration step

### the generated document is never hand-written [~]

  - [~] **Draft**: MANUAL: it names `dod_generate` as the producer and forbids editing the rendered `dod.md` by hand, because every write regenerates that file from canonical storage

### steps subcommand writes the change's plan [~]

  - [ ] Proof: `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` -> `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` exits 0, covering a run that writes the file at the path OpenSpec resolved <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/openspec/steps-cli.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.
  - [~] **Draft**: MANUAL: the file holds `goal`, `cwd`, `plan_source` set to the change id, and `plan_artifacts` taken from `openspec status --json --change <id>`

### a concrete leaf becomes a verified step [ ]

  - [ ] Proof: `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` -> `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` exits 0, covering four steps in source order where each after the first names its predecessor in `deps` <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/openspec/steps-cli.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.

### a MANUAL draft becomes a manual step [ ]

  - [ ] Proof: `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` -> `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` exits 0, covering a manual step with `manual_required` true and an empty `verify_cmd` <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/openspec/steps-cli.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.

### fields a machine cannot know are left for judgment [ ]

  - [ ] Proof: `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` -> `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` exits 0, covering a step whose `files` is empty, whose `verify_surface` is `code`, and whose `status` is `pending` <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/openspec/steps-cli.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.

### exit codes match the trace subcommand [ ]

  - [ ] Proof: `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` -> `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` exits 0, covering an exit code of 3 <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/openspec/steps-cli.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.

### a refactor pass opens a change [~]

  - [~] **Draft**: MANUAL: a change exists whose `.openspec.yaml` sets `skip_specs: true`
  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=refactor-skip-specs` -> `node scripts/ci/check-skill-hygiene.mjs --rule=refactor-skip-specs` exits 0, having found the skill setting `skip_specs: true` <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10

### the plan lands in the change [~]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=no-step-session` -> `node scripts/ci/check-skill-hygiene.mjs --rule=no-step-session` exits 0, and the skill names the change directory as the home for both files <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10
  - [~] **Draft**: MANUAL: that file remains regenerable scanner output and is not treated as the plan

### the skill carries no copy of the steps shape [ ]

  - [ ] Proof: `node scripts/ci/check-skill-hygiene.mjs --rule=no-authoring-copy` -> `node scripts/ci/check-skill-hygiene.mjs --rule=no-authoring-copy` exits 0 <!--p:{"type":"exit_code","value":0}-->
    > ⚠ node:internal/modules/cjs/loader:1404
  throw err;
  ^

Error: Cannot find module 'C:\Users\siriu\mcp-servers\dod-guard\scripts\ci\check-skill-hygiene.mjs'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:10

### a leaf keeps its scenario name through the round trip [ ]

  - [ ] Proof: `node --test packages/dod-guard/dist/title-round-trip.test.js` -> `node --test packages/dod-guard/dist/title-round-trip.test.js` exits 0, covering a rendered concrete leaf that carries its title <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/title-round-trip.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.
  - [ ] Proof: `node --test packages/dod-guard/dist/title-round-trip.test.js` -> `node --test packages/dod-guard/dist/title-round-trip.test.js` exits 0, covering a leaf whose title is the scenario heading and whose description is the THEN text <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/title-round-trip.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.

### regeneration refreshes the leaf title [ ]

  - [ ] Proof: `node --test packages/dod-guard/dist/title-round-trip.test.js` -> `node --test packages/dod-guard/dist/title-round-trip.test.js` exits 0, covering an amended leaf whose title matches the current scenario <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/title-round-trip.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.
  - [ ] Proof: `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` -> `node --test packages/dod-guard/dist/openspec/steps-cli.test.js` exits 0, covering step titles that match the current scenario headings <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/openspec/steps-cli.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.

### a removed requirement produces no proof [~]

  - [ ] Proof: `node --test packages/dod-guard/dist/openspec/delta-sections.test.js` -> `node --test packages/dod-guard/dist/openspec/delta-sections.test.js` exits 0, covering a tree with no node for the removed requirement <!--p:{"type":"exit_code","value":0}-->
    > ⚠ Could not find 'packages/dod-guard/dist/openspec/delta-sections.test.js'


Diagnosis: Expected exit code 0, got 1. Command failed to execute successfully. Check the error output above.
  - [~] **Draft**: MANUAL: it holds the document at INCOMPLETE forever, since no work can satisfy a requirement that was deleted

</definition_of_done>

## Amendment log

- **2026-08-12T15:57:32.631Z** [13.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T15:57:32.635Z** [14.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T15:57:32.639Z** [15.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T15:57:32.643Z** [16.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T15:57:32.647Z** [17.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T18:56:40.616Z** [21] added: Added requirement group: a leaf keeps its scenario name through the round trip
- **2026-08-12T18:56:40.630Z** [21.children.0] added: Added concrete node: A generated leaf is inspected in storage
- **2026-08-12T18:56:40.634Z** [21.children.1] added: Added concrete node: The parser reads a rendered leaf back
- **2026-08-12T18:56:40.638Z** [22] added: Added requirement group: regeneration refreshes the leaf title
- **2026-08-12T18:56:40.640Z** [22.children.0] added: Added concrete node: A scenario's THEN line is rewritten and the DoD regenerated
- **2026-08-12T18:56:40.644Z** [22.children.1] added: Added concrete node: A stale title would reach the step plan
- **2026-08-12T18:58:38.844Z** [1.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T18:58:38.850Z** [1.children.1] modified: Regenerated: scenario text changed
- **2026-08-12T18:58:38.859Z** [4.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T18:58:38.870Z** [7.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T18:58:38.884Z** [21.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T18:58:38.890Z** [21.children.1] modified: Regenerated: scenario text changed
- **2026-08-12T18:58:38.896Z** [22.children.0] modified: Regenerated: scenario text changed
- **2026-08-12T18:58:38.912Z** [18.children.1] modified: Regenerated: scenario text changed
- **2026-08-12T19:00:18.967Z** [1.children.1] removed: Removed node "`openspec status --json` reports the `steps` artifact as not blocked"
- **2026-08-12T19:00:18.972Z** [1.children.2] added: Added draft node: Change with no spec deltas still reaches steps
- **2026-08-12T19:00:18.996Z** [23] added: Added requirement group: a removed requirement produces no proof
- **2026-08-12T19:00:18.999Z** [23.children.0] added: Added concrete node: A delta removes a requirement
- **2026-08-12T19:00:19.006Z** [23.children.1] added: Added draft node: A removed requirement would otherwise never be satisfiable
