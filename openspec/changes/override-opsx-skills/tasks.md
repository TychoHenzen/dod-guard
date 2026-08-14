## 1. Create the six override skills

- [x] 1.1 Create `packages/dod-guard/skills/opsx-explore/SKILL.md` with spec awareness, handoff to interview/propose, capability group awareness, and coverage context
<!-- covers: dod-guard/opsx-explore :: Existing spec awareness :: Related spec exists -->
<!-- covers: dod-guard/opsx-explore :: Existing spec awareness :: No active changes -->
<!-- covers: dod-guard/opsx-explore :: Handoff awareness :: Requirements need pinning -->
<!-- covers: dod-guard/opsx-explore :: Handoff awareness :: Ready to propose -->
<!-- covers: dod-guard/opsx-explore :: Handoff awareness :: User asks to implement during exploration -->
<!-- covers: dod-guard/opsx-explore :: Capability group awareness :: Cross-package exploration -->
<!-- covers: dod-guard/opsx-explore :: Coverage context :: User asks about coverage -->

- [x] 1.2 Create `packages/dod-guard/skills/opsx-propose/SKILL.md` with dod-guard-spec-driven schema default, steps generation via `dod-guard steps`, validation, and planning boundary
<!-- covers: dod-guard/opsx-propose :: Use the dod-guard-spec-driven schema by default :: Default schema used -->
<!-- covers: dod-guard/opsx-propose :: Use the dod-guard-spec-driven schema by default :: User requests different schema -->
<!-- covers: dod-guard/opsx-propose :: Generate steps.json via dod-guard CLI :: Steps generated from tasks -->
<!-- covers: dod-guard/opsx-propose :: Generate steps.json via dod-guard CLI :: Steps generated without covers annotations -->
<!-- covers: dod-guard/opsx-propose :: Validate before handoff :: Validation passes -->
<!-- covers: dod-guard/opsx-propose :: Validate before handoff :: Validation fails -->
<!-- covers: dod-guard/opsx-propose :: Planning boundary :: User asks to implement during proposal -->
<!-- covers: dod-guard/opsx-propose :: Capability group organization :: Spec delta for dod-guard capability -->

- [x] 1.3 Create `packages/dod-guard/skills/opsx-apply/SKILL.md` with step-by-step routing, stale steps detection, coverage gate, and change selection
<!-- covers: dod-guard/opsx-apply :: Route through step-by-step :: Change has steps.json -->
<!-- covers: dod-guard/opsx-apply :: Route through step-by-step :: Change has no steps.json -->
<!-- covers: dod-guard/opsx-apply :: Regenerate stale steps :: Steps are stale -->
<!-- covers: dod-guard/opsx-apply :: Regenerate stale steps :: Steps are current -->
<!-- covers: dod-guard/opsx-apply :: Coverage gate before archive :: Coverage passes -->
<!-- covers: dod-guard/opsx-apply :: Coverage gate before archive :: Coverage regression -->
<!-- covers: dod-guard/opsx-apply :: Change selection :: Single active change -->

- [x] 1.4 Create `packages/dod-guard/skills/opsx-update/SKILL.md` with steps regeneration, artifact coherence checks, validation, and planning boundary
<!-- covers: dod-guard/opsx-update :: Regenerate steps on task changes :: Task added -->
<!-- covers: dod-guard/opsx-update :: Regenerate steps on task changes :: Task reworded -->
<!-- covers: dod-guard/opsx-update :: Artifact coherence :: Proposal capability added -->
<!-- covers: dod-guard/opsx-update :: Artifact coherence :: Spec scenario removed -->
<!-- covers: dod-guard/opsx-update :: Validate after updates :: Update introduces validation error -->
<!-- covers: dod-guard/opsx-update :: Planning boundary :: User asks to implement during update -->

- [x] 1.5 Create `packages/dod-guard/skills/opsx-sync/SKILL.md` with intelligent merge for ADDED/MODIFIED/REMOVED operations, new capability creation, and path preservation
<!-- covers: dod-guard/opsx-sync :: Intelligent merge :: ADDED requirement merged -->
<!-- covers: dod-guard/opsx-sync :: Intelligent merge :: MODIFIED requirement merged -->
<!-- covers: dod-guard/opsx-sync :: Intelligent merge :: REMOVED requirement merged -->
<!-- covers: dod-guard/opsx-sync :: New capability creation :: Delta targets nonexistent capability -->
<!-- covers: dod-guard/opsx-sync :: Preserve capability path :: Nested capability path -->

- [x] 1.6 Create `packages/dod-guard/skills/opsx-archive/SKILL.md` with coverage gate, skip-specs support, no-confirmation archive, and change selection
<!-- covers: dod-guard/opsx-archive :: Coverage gate :: Coverage passes -->
<!-- covers: dod-guard/opsx-archive :: Coverage gate :: Coverage regresses -->
<!-- covers: dod-guard/opsx-archive :: Coverage gate :: Coverage usage error -->
<!-- covers: dod-guard/opsx-archive :: Skip-specs support :: Change has skip_specs -->
<!-- covers: dod-guard/opsx-archive :: Archive without confirmation :: Archive runs without prompt -->
<!-- covers: dod-guard/opsx-archive :: Change selection :: Multiple active changes -->

## 2. Delete the generated skills

- [x] 2.1 Delete all six `.claude/skills/openspec-*` directories

## 3. Plugin configuration

- [ ] 3.1 Update `packages/dod-guard/.claude-plugin/marketplace.json` to list the six new skills in the description and update the skill count
- [ ] 3.2 Run `validate-plugins.mjs` and `check-skill-hygiene.mjs` to confirm all skills pass
