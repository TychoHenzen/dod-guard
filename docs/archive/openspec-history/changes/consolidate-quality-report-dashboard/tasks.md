## 1. Canonical report and architecture evidence

- [ ] 1.1 Pin the generator to the canonical structural scanner, optional architecture configuration, contained source discovery, and failure behavior with focused tests.
  <!-- covers: quality-guard/repository-report :: Generator uses canonical quality evidence :: Repository report is generated -->
  <!-- covers: quality-guard/repository-report :: Generator uses canonical quality evidence :: Structural scanner rejects the request -->
  <!-- covers: quality-guard/repository-report :: Generator uses canonical quality evidence :: Architecture configuration is invalid -->
  <!-- covers: quality-guard/repository-report :: Generator uses canonical quality evidence :: Source path escapes the project -->

- [ ] 1.2 Repair current-state placement and dependency analysis with deterministic evidence fixtures.
  <!-- covers: quality-guard/architecture-analysis :: Current-state analysis reports cross-file concerns :: Current repository contains cross-file concerns -->
  <!-- covers: quality-guard/architecture-analysis :: Current-state analysis reports cross-file concerns :: Current repository has no configured dependency violation -->

- [ ] 1.3 Repair and deduplicate current-state encapsulation and caller analysis across supported source forms.
  <!-- covers: quality-guard/architecture-analysis :: Current-state findings exclude parser artifacts :: Implementation contains control flow and local data -->
  <!-- covers: quality-guard/architecture-analysis :: Current-state findings exclude parser artifacts :: Public symbol has no production caller -->
  <!-- covers: quality-guard/architecture-analysis :: Current-state findings exclude parser artifacts :: Caller resolution is incomplete -->

- [ ] 1.4 Define and validate report schema version 1, including field, path, depth, size, file-count, finding-count, and timeout failures.
  <!-- covers: quality-guard/repository-report :: Report artifacts have one bounded versioned schema :: Malformed artifact is loaded -->
  <!-- covers: quality-guard/repository-report :: Report artifacts have one bounded versioned schema :: Artifact exceeds a resource limit -->

## 2. Durable external generation

- [ ] 2.1 Add the external generator command with contained `.quality` creation and replacement tests that prove readers never observe partial JSON and ordinary failures preserve the prior artifact.
  <!-- covers: quality-guard/repository-report :: Generator writes one durable artifact atomically :: Successful regeneration replaces the artifact -->
  <!-- covers: quality-guard/repository-report :: Generator writes one durable artifact atomically :: Failed regeneration preserves prior evidence -->
  <!-- covers: quality-guard/repository-report :: Generator writes one durable artifact atomically :: Artifact path escapes through filesystem indirection -->

- [ ] 2.2 Serialize generation per project and cover concurrent requests plus missing, corrupt, and incompatible generator failures.
  <!-- covers: quality-guard/repository-report :: Regeneration is serialized per project :: Concurrent regeneration targets one project -->
  <!-- covers: quality-guard/repository-report :: Regeneration is serialized per project :: Bundled generator cannot load -->

## 3. Dashboard API and project safety

- [ ] 3.1 Add registered-project report loading with schema validation, containment checks, missing-artifact state, and unavailable-project state.
  <!-- covers: openspec-dashboard/ui :: A project exposes a structured Quality view :: Quality artifact is missing -->
  <!-- covers: openspec-dashboard/ui :: A project exposes a structured Quality view :: Artifact read escapes through filesystem indirection -->
  <!-- covers: openspec-dashboard/ui :: Unsupported projects remain readable :: Registered project cannot generate a report -->

- [ ] 3.2 Add token-and-Origin-protected regeneration routing with fixed no-shell generator invocation and per-project conflict handling.
  <!-- covers: openspec-dashboard/ui :: Regenerate and Reload are distinct actions :: Reader regenerates quality evidence -->
  <!-- covers: openspec-dashboard/ui :: Regenerate and Reload are distinct actions :: Foreign page requests regeneration -->

- [ ] 3.3 Add reload and all regeneration failure paths while retaining the last valid artifact and display state.
  <!-- covers: openspec-dashboard/ui :: Regenerate and Reload are distinct actions :: Reader reloads quality evidence -->
  <!-- covers: openspec-dashboard/ui :: Regenerate and Reload are distinct actions :: Generation fails -->
  <!-- covers: openspec-dashboard/ui :: Regenerate and Reload are distinct actions :: Generation fails before any valid report was displayed -->
  <!-- covers: openspec-dashboard/ui :: Regenerate and Reload are distinct actions :: Reload finds an invalid artifact -->

## 4. Structured Quality interface

- [ ] 4.1 Add the Quality navigation entry, summary cards, rule groups, collapsed file details, and four cross-file appendix sections.
  <!-- covers: openspec-dashboard/ui :: A project exposes a structured Quality view :: Valid quality artifact is opened -->

- [ ] 4.2 Add exact text, severity, classification, and rule filters with AND semantics and an explicit empty state.
  <!-- covers: openspec-dashboard/ui :: A project exposes a structured Quality view :: Reader filters quality findings -->

- [ ] 4.3 Render all report-derived values through text nodes and prove markup remains inert.
  <!-- covers: openspec-dashboard/ui :: A project exposes a structured Quality view :: Artifact text contains markup -->

- [ ] 4.4 Keep ordinary navigation and Refresh read-only while exposing Regenerate as the sole report-writing control.
  <!-- covers: openspec-dashboard/ui :: The view never edits anything :: Reader clicks a task's completion box -->
  <!-- covers: openspec-dashboard/ui :: The view never edits anything :: Reader uses ordinary navigation or refresh -->
  <!-- covers: openspec-dashboard/ui :: The view never edits anything :: Reader explicitly regenerates the quality report -->

## 5. MCP consolidation and final gates

- [ ] 5.1 Remove `quality_report` from MCP registration, retain `quality_scan` unchanged, and update tool-list tests and user documentation.
  <!-- covers: quality-guard/mcp-tools :: Server exposes three tools :: Client lists the tools -->

- [ ] 5.2 Run quality-guard tests, dashboard tests, builds, Biome, strict OpenSpec validation, and `dod-guard cover consolidate-quality-report-dashboard`; confirm `.quality/quality-report.json` remains untracked generated output.
