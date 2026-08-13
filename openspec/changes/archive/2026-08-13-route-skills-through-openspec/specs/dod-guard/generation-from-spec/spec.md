## REMOVED Requirements

### Requirement: DoD artifact in the schema

**Reason**: The `dod` artifact is deleted from
`openspec/schemas/dod-guard-spec-driven/schema.yaml`. No document is
generated between `specs` and `steps` anymore.

**Migration**: `steps` now depends directly on `tasks`; see
`dod-guard/steps-generation`.

### Requirement: DoD generated from spec deltas

**Reason**: `dod_generate`, `packages/dod-guard/src/openspec/convert.ts`, and
`packages/dod-guard/src/parser.ts` are deleted. A census taken against the
DoD store found 78 percent of passing proofs were self-authored and told
nobody anything; the generation pipeline that produced them is gone, not
repaired.

**Migration**: `dod-guard/coverage-gate` binds a scenario directly to a named
test through a marker in the test file, with no intermediate document.

### Requirement: Uncheckable scenario becomes a draft leaf

**Reason**: No leaf, draft or concrete, exists. `MANUAL:` intents and the
concept of a leaf held at INCOMPLETE are gone with the DoD tree.

**Migration**: A scenario with no test binding yet is `unwired` under
`dod-guard cover`, the direct successor of "no proof exists for this yet".

### Requirement: Generated DoD registers through dod_import

**Reason**: `dod_import` is deleted along with every other DoD-tree MCP
tool.

**Migration**: None. Nothing registers a generated document, because
nothing generates one.

### Requirement: Regenerated DoD preserves the tamper fingerprint

**Reason**: `packages/dod-guard/src/fingerprint.ts` is deleted.
`docs/shortcomings.md` found the fingerprint protected against an
out-of-band edit to the store but not against `dod_amend` legitimately
weakening a proof the same agent wrote - the same agent authoring both the
check and its own grade was the actual defect, and no fingerprint algorithm
fixes that.

**Migration**: None. There is no store and nothing to protect a fingerprint
against.
