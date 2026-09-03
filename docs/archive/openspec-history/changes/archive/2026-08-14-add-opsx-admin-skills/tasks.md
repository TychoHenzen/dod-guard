## 1. opsx-init skill

- [x] 1.1 Create `packages/dod-guard/skills/opsx-init/SKILL.md` with frontmatter, project detection, `openspec init --tools claude`, schema copy, context detection, and dashboard registration
<!-- covers: dod-guard/opsx-init :: Project detection before initialization :: Fresh project with no OpenSpec directory -->
<!-- covers: dod-guard/opsx-init :: Project detection before initialization :: Project already initialized -->
<!-- covers: dod-guard/opsx-init :: Schema setup :: No custom schema exists -->
<!-- covers: dod-guard/opsx-init :: Schema setup :: Custom schema already exists -->
<!-- covers: dod-guard/opsx-init :: Schema setup :: User declines schema copy -->
<!-- covers: dod-guard/opsx-init :: Project context configuration :: Node.js TypeScript project detected -->
<!-- covers: dod-guard/opsx-init :: Project context configuration :: No recognizable manifest -->
<!-- covers: dod-guard/opsx-init :: Dashboard registration :: Project not in dashboard registry -->
<!-- covers: dod-guard/opsx-init :: Dashboard registration :: Project already registered -->
<!-- covers: dod-guard/opsx-init :: Completion summary :: All steps completed -->

## 2. opsx-dashboard skill

- [x] 2.1 Create `packages/dod-guard/skills/opsx-dashboard/SKILL.md` with frontmatter, server start/stop, port detection, and user direction
<!-- covers: dod-guard/opsx-dashboard :: Start the dashboard server :: No dashboard running -->
<!-- covers: dod-guard/opsx-dashboard :: Start the dashboard server :: Dashboard already running -->
<!-- covers: dod-guard/opsx-dashboard :: Stop the dashboard server :: User asks to stop -->
<!-- covers: dod-guard/opsx-dashboard :: Stop the dashboard server :: No dashboard to stop -->
<!-- covers: dod-guard/opsx-dashboard :: Direct user to the dashboard :: Project is registered -->
<!-- covers: dod-guard/opsx-dashboard :: Direct user to the dashboard :: Project is not registered -->
<!-- covers: dod-guard/opsx-dashboard :: Locate the dashboard script :: Script found via package resolution -->

## 3. opsx-doctor skill

- [x] 3.1 Create `packages/dod-guard/skills/opsx-doctor/SKILL.md` with frontmatter, `openspec doctor`, `openspec validate --all --strict --no-interactive`, plain-language report, and store awareness
<!-- covers: dod-guard/opsx-doctor :: Run health checks :: Both commands succeed -->
<!-- covers: dod-guard/opsx-doctor :: Run health checks :: Doctor reports relationship issues -->
<!-- covers: dod-guard/opsx-doctor :: Run health checks :: Validate reports strict violations -->
<!-- covers: dod-guard/opsx-doctor :: Plain-language report with fix suggestions :: Orphaned spec delta -->
<!-- covers: dod-guard/opsx-doctor :: Plain-language report with fix suggestions :: Scenario heading level wrong -->
<!-- covers: dod-guard/opsx-doctor :: Store awareness :: Project uses a store -->
<!-- covers: dod-guard/opsx-doctor :: Store awareness :: No store configured -->

## 4. Plugin configuration

- [x] 4.1 Update `packages/dod-guard/.claude-plugin/marketplace.json` to list the three new skills in the description
- [x] 4.2 Run `validate-plugins.mjs` and `check-skill-hygiene.mjs` to confirm the new skills pass all checks
