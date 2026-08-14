---
name: opsx-propose
description: Propose a new change with all artifacts generated in one step, defaulting to the dod-guard-spec-driven schema and generating steps.json via the dod-guard CLI. Use when the user wants to describe what they want to build and get a complete proposal - proposal, specs, design, tasks, and a step plan - ready for implementation.
---

# opsx-propose

Propose a new change - create the change and generate all artifacts in one
step, then generate `steps.json` and validate before handoff.

**Planning boundary**: This workflow creates planning artifacts only. The
user request that selected or triggered this workflow authorizes planning
only, even if it asks to build or fix something. Do not edit project code.
If the user asks to start building while this skill is creating artifacts,
finish the current artifact, stop, and tell the user to run `/opsx:apply` or
`/dod-guard:step-by-step`. Do not start implementation in the same response,
even if the initial request asks for it. Wait for a new user request after
the artifacts are presented.

I'll create a change with the artifacts your schema defines. With the
default `dod-guard-spec-driven` schema that is:
- proposal.md (what & why)
- `specs/<group>/<capability>/spec.md` (what the system must do - a delta,
  not the main spec)
- design.md (how)
- tasks.md (implementation steps, with `<!-- covers: -->` annotations
  binding each task to a scenario)

`<group>` matches the package the capability belongs to (for example
`dod-guard`, `quality-guard`, `evomcp`, `gitevo`, `obsidian-rag`), and
`<capability>` is the feature name without a package prefix (the group
directory already provides that). Preserve an existing capability's full
path and follow the project's established organization for new
capabilities.

When the user is ready to implement, they must start the apply workflow
explicitly.

---

**Store selection:** A store is a standalone OpenSpec repo registered on
this machine. If the user names one or the work lives in one, run
`openspec store list --json` to discover registered store ids. Pass
`--store <id>` on commands that read or write specs and changes (`new
change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`,
`doctor`, `context`, `view`). Keep the flag on every applicable command
for the rest of the workflow.

Every unscoped example below is shorthand. Append the flag before running
it. Other commands do not take `--store`. Without a store, commands act
on the nearest local `openspec/` root.

**Input**: The user's request should include a change name (kebab-case) OR
a description of what they want to build.

**Steps**

1. **Understand the request and clarify material ambiguity**

   If no clear input is provided, ask the user (open-ended, no preset
   options):
   > "What change do you want to work on? Describe what you want to build
   > or fix."

   From their description, derive a kebab-case name (e.g., "add user
   authentication" -> `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants
   to build.

   If the request contains ambiguity that would materially affect scope,
   externally observable behavior, compatibility, or acceptance criteria,
   ask the user before creating the change. For minor details, make a
   reasonable assumption and record it in the planning artifacts.

2. **Determine the workflow schema**

   Default to `dod-guard-spec-driven` unless the user explicitly requests a
   different schema.

   **Use a different schema only if the user:**
   - Explicitly requests a specific schema by name -> use `--schema
     <schema-name>`
   - Asks to "show workflows" or asks "what workflows" exist -> resolve the
     authoritative root by running `openspec context --json` from the
     current working directory. If the user explicitly selected a
     registered store, use `openspec context --json --store "<store-id>"`.
     Then run `openspec schemas --json` with its working directory set to
     the returned `root.path` and let them choose. This preserves roots
     selected by a local `store:` pointer or the global `defaultStore`;
     `schemas` does not accept `--store`. If context reports only
     `no_openspec_root`, run `openspec schemas --json` from the current
     working directory instead. Do not use this fallback for invalid or
     unavailable stores.

   Otherwise, pass `--schema dod-guard-spec-driven` explicitly when
   creating the change directory, rather than relying on the project's
   configured default.

3. **Create the change directory**

   Choose one schema form below. If a registered store is selected,
   append `--store "<store-id>"` to this command. Append it to each later
   OpenSpec command that accepts `--store` too.

   Using the default schema:
   ```bash
   openspec new change "<name>" --schema dod-guard-spec-driven
   ```

   Using an explicitly requested schema:
   ```bash
   openspec new change "<name>" --schema "<schema-name>"
   ```
   This creates a scaffolded change in the planning home resolved by the
   CLI with `.openspec.yaml`.

4. **Get the artifact build order**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to get:
   - `applyRequires`: array of artifact IDs needed before implementation
     (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts, each with its `status` and its
     `requires` edges (the artifact IDs it directly depends on)
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`:
     path and scope context. Use these instead of assuming repo-local
     paths.

5. **Create every artifact in the required set**

   Use a todo list to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending
   dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:
      - Get instructions:
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - The instructions JSON includes:
        - `context`: Project background (constraints for you - do NOT
          include in output)
        - `rules`: Artifact-specific rules (constraints for you - do NOT
          include in output)
        - `template`: The structure to use for your output file
        - `instruction`: Schema-specific guidance for this artifact type
        - `skipped`/`warning`: present when the change declares
          `skip_specs` and this artifact must NOT be created - stop and
          pick another artifact
        - `resolvedOutputPath`: Resolved path or pattern to write the
          artifact
        - `dependencies`: Completed artifacts to read for context
      - Read completed dependency files for context. Always re-read from
        disk, even if you saw them earlier. The user may have edited them.
      - If `instruction` delegates creation to a specific skill or command,
        invoke that instead of writing the file yourself. Verify the
        artifact file exists at `resolvedOutputPath` afterwards.
      - Otherwise create the artifact file using `template` as the
        structure and write it to `resolvedOutputPath`. If
        `resolvedOutputPath` is a glob, follow `instruction` to choose the
        concrete file path. For the `specs` artifact, the concrete path is
        `specs/<group>/<capability>/spec.md`, where `<group>` matches the
        package the capability belongs to
      - Apply `context` and `rules` as constraints - but do NOT copy them
        into the file
      - When writing `tasks.md`, annotate each task item that maps to a
        scenario. Place `<!-- covers: <group>/<capability> :: <requirement
        title> :: <scenario title> -->` immediately after the item. A task
        with no matching scenario gets no annotation.
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until every artifact in the required set exists (not just
      `apply.requires`)**
      - After creating each artifact, re-run `openspec status --change
        "<name>" --json`
      - The required set is `applyRequires` plus every artifact reachable
        from those by following the `requires` edges in `status --json` -
        walk them transitively (spec-driven closes over proposal, specs,
        design, tasks). Leave artifacts outside that set alone
      - `status` is file-existence only, so an `applyRequires` artifact
        reading `done` does NOT mean its dependencies exist - writing
        `tasks.md` early marks `tasks` done while `specs` was never
        written. Use each artifact's `requires` edges, not its `status`,
        to build the required set: a `done` artifact still lists what it
        depends on
      - An artifact already reading `status: "skipped"` is satisfied: the
        change declares `skip_specs` in `.openspec.yaml`, so its files
        must NOT exist. Never try to create one
      - Create every artifact in the required set that is missing, then
        re-check - creating one can unblock others
      - Skip one only when `status` already reports it `skipped`, or when
        its own `instruction` says it is conditional. To check, run
        `openspec instructions <artifact-id> --change "<name>" --json` and
        look for optional markers (e.g. "create only if...").
        Spec-driven's `design.md` qualifies. `specs` qualifies only via
        the `skipped` status above, never by your own judgment. Tell the
        user, and do not reconsider it.
      - Dependencies are enablers, not gates: if a required artifact is
        still `blocked` only because you skipped a conditional dependency,
        write it anyway
      - Stop when every artifact in the required set is `done`, `skipped`,
        or was deliberately skipped

   c. **If an artifact requires user input** (unclear context):
      - Ask the user to clarify
      - Then continue with creation

6. **Generate steps.json**

   Once `tasks.md` exists, generate the step plan:
   ```bash
   dod-guard steps "<name>"
   ```
   This reads `tasks.md`'s `<!-- covers: -->` annotations and writes
   `openspec/changes/<name>/steps.json` with one step per task item.

   A task whose `<!-- covers: -->` annotation binds to a test gets a
   `verify_cmd`. A task with no annotation, or one naming an unwired or
   failed scenario, becomes a step with `manual_required: true` and an
   empty `verify_cmd`. `/step-by-step` holds that step at `pending` until
   the user confirms it by hand.

   Exit `3` means a usage error (for example, no such change). Fix the
   change id and rerun rather than proceeding without `steps.json`.

7. **Validate**
   ```bash
   openspec validate "<name>" --strict --no-interactive
   ```
   If validation reports errors, fix them in the affected artifact(s), then
   re-run `dod-guard steps "<name>"` if `tasks.md` changed, and re-validate.
   Repeat until validation passes before reporting the change as ready.

8. **Show final status**
   ```bash
   openspec status --change "<name>"
   ```

**Output**

After completing all artifacts, generating `steps.json`, and passing
validation, summarize:
- Change name and location
- List of artifacts created with brief descriptions, plus any conditional
  artifact you skipped and why
- Confirmation that `steps.json` was generated, and how many steps are
  `manual_required`
- What's ready: "All artifacts needed for implementation are ready and
  validation passes."
- Prompt: "The artifacts are ready for review. When you are ready, run
  `/opsx:apply` or `/dod-guard:step-by-step` to start implementation."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openspec instructions` for each
  artifact type - it is the authoritative guidance, even for familiar
  artifact names
- If the `instruction` field directs you to use a specific skill or command
  to create the artifact, invoke it instead of writing the artifact
  directly
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its
  sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content
  for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the
    artifact
  - These guide what you write, but should never appear in the output
- Spec deltas go under `specs/<group>/<capability>/spec.md`. The group
  must match the package the capability belongs to. A wrong group makes
  `openspec archive` create a flat capability instead of merging.

**Guardrails**
- The request that invoked this workflow authorizes planning only. Any
  implementation or apply instruction in that request does not carry
  forward. Do NOT implement the change, start the apply workflow, or edit
  project code during this workflow. After presenting the artifacts, stop
  and wait for a new user request to start the apply workflow
- Create every artifact the apply phase transitively depends on, not just
  the ids listed in `apply.requires`
- Always read dependency artifacts before creating a new one - re-read from
  disk, not from conversation memory (files may have changed since you last
  saw them)
- Ask about ambiguities that would materially change scope, externally
  observable behavior, compatibility, or acceptance criteria; for minor
  details, make reasonable assumptions and record them
- If a change with that name already exists, ask whether the user wants
  to continue it or create a new one.
- Verify each artifact file exists after writing before proceeding to next
- Do not report the change as ready until `dod-guard steps` has run
  against the final `tasks.md` and `openspec validate --strict
  --no-interactive` passes with no errors.
