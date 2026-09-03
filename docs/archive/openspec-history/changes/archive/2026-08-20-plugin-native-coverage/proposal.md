## Why

OpenSpec scenarios are intended to map one-to-one to tests that prove the behavior they claim. Today `dod-guard cover` can report only `bound` or `unwired`, and Pensieve cannot reliably invoke the installed command or obtain a test command across consumer projects.

## What Changes

- Expose the coverage engine through the installed plugin runtime without consumer-specific `PATH` or workspace configuration.
- Return structured scenario coverage results through the plugin-native interface.
- Resolve each bound scenario to its test file, test name, language, and whole-file verification command.
- Keep the shell CLI as a compatible human and CI entry point over the same engine.
- Support language-specific test discovery and command construction through extensible adapters.
- Preserve the existing coverage-gate ratchet and regression exit behavior.

## Capabilities

### New Capabilities

- `dod-guard/coverage-runtime`: Expose portable, structured scenario coverage and verification data to plugin consumers.

### Modified Capabilities

- `dod-guard/coverage-gate`: A bound scenario now provides a resolved test command and plugin-native callers use the same coverage contract.

## Impact

- Affected code includes the `dod-guard` coverage scanner, language adapters, CLI entry point, plugin manifest/runtime wiring, and Pensieve integration surface.
- Existing shell callers retain their command and exit-code behavior.
- Consumer workspaces need no new configuration after plugin installation.
- Tests must cover consumer-project execution and multiple supported language families.
