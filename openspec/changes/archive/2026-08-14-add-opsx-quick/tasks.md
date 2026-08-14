## 1. opsx-quick skill

- [x] 1.1 Create `packages/dod-guard/skills/opsx-quick/SKILL.md` with minimal clarification, adaptive artifact depth, steps generation, step-by-step handoff, and post-implementation spec sync
<!-- covers: dod-guard/opsx-quick :: Minimal clarification :: Clear request needs one question -->
<!-- covers: dod-guard/opsx-quick :: Minimal clarification :: Ambiguous request needs three questions -->
<!-- covers: dod-guard/opsx-quick :: Adaptive artifact depth :: Small change skips specs and design -->
<!-- covers: dod-guard/opsx-quick :: Adaptive artifact depth :: Larger change includes specs -->
<!-- covers: dod-guard/opsx-quick :: Adaptive artifact depth :: Cross-cutting change includes design -->
<!-- covers: dod-guard/opsx-quick :: Automatic steps generation and handoff :: Steps generated and step-by-step invoked -->
<!-- covers: dod-guard/opsx-quick :: Post-implementation spec sync :: Change had specs and coverage passes -->
<!-- covers: dod-guard/opsx-quick :: Post-implementation spec sync :: Change skipped specs but added behavior -->
<!-- covers: dod-guard/opsx-quick :: Single-flow execution :: Complete flow in one run -->

## 2. Plugin configuration

- [x] 2.1 Update `packages/dod-guard/.claude-plugin/marketplace.json` to list the new skill
- [x] 2.2 Run `validate-plugins.mjs` and `check-skill-hygiene.mjs` to confirm the new skill passes
