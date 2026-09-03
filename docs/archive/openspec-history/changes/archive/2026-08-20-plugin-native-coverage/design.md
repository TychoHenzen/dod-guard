## Context

The current scanner recognizes markers and reports only `bound` or `unwired`. The CLI bundle is usable by explicit path, but Pensieve has no plugin-native coverage surface and no shared binding-to-command result. Existing language parsing already centralizes marker recognition and test-file discovery.

## Goals / Non-Goals

**Goals:**

- Keep one coverage engine for shell, CI, and plugin-native callers.
- Add a structured result model that carries binding and verification details.
- Resolve commands through language adapters using the consumer workspace as the command root.
- Make plugin installation provide the callable surface without consumer configuration.
- Preserve current ratchet and plan-check semantics.

**Non-Goals:**

- Proving runtime reachability beyond a valid test binding.
- Running tests inside `cover` itself.
- Adding a new test framework to every supported language.
- Requiring consumers to edit their workspace manifests.

## Decisions

### Shared core before interfaces

The scanner will produce a structured coverage report in the core package. The shell CLI will render that report and map its existing exit codes. The plugin-native entry point will serialize the same report. This avoids separate discovery behavior in Pensieve.

An alternative was to make Pensieve parse CLI text. That would couple a machine interface to human output and lose binding metadata.

### Language adapters own command construction

Each supported language family will provide test declaration detection and whole-file command construction through one adapter contract. The adapter receives the consumer workspace root, discovered test file, and project configuration. It returns a command or an unresolved reason.

An alternative was one TypeScript-specific command builder. That would make the existing multi-language marker support misleading and would put repository-specific paths into results.

### Plugin runtime owns discovery

The plugin manifest/runtime will register the coverage operation and pass the caller's workspace context to the shared core. The implementation will resolve package resources from the installed plugin runtime, never from the plugin source checkout or a consumer-authored absolute path.

An alternative was to require `PATH` or a workspace script. That fails immediately after installation and varies by device.

### Preserve ratchet semantics

The existing outcome comparison remains unchanged. A scenario can be bound while its command is unresolved. Command availability is diagnostic metadata, not a new coverage outcome, so existing baselines remain compatible.

## Risks / Trade-offs

- [Risk] A project uses a supported language with a custom runner layout. -> Use project-level test-glob and runner configuration when present, and return an explicit unresolved reason otherwise.
- [Risk] A plugin caller supplies a workspace path that is not a project root. -> Return a structured context error and do not guess a path from the plugin installation.
- [Risk] Existing consumers parse CLI text. -> Keep current human-readable lines and exit codes stable while adding structured output only to the native interface.
- [Risk] A bound marker names a test declaration that does not execute the scenario. -> Keep marker binding as the declared contract and leave runtime reachability to a later requirement.

## Migration Plan

1. Add the shared result and language-adapter interfaces.
2. Route the existing scanner and CLI through the shared result.
3. Register the plugin-native coverage operation.
4. Add consumer-workspace fixtures for multiple language families.
5. Build, run package tests, and run the change-scoped coverage gate.

Rollback removes the new native registration and command metadata while retaining the existing marker scanner and baseline file format.
