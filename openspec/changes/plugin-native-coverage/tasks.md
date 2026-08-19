## 1. Shared coverage result

- [x] 1.1 Define the structured scenario result and gate result types shared by CLI and plugin callers
<!-- covers: dod-guard/coverage-runtime :: Plugin coverage results are structured :: A bound scenario returns its test binding and command -->
<!-- status: completed -->
- [x] 1.2 Refactor report construction to retain binding metadata and unresolved-command reasons without changing ratchet outcomes
<!-- covers: dod-guard/coverage-gate :: cover reports a scenario's state :: A bound test has no available runner -->
<!-- status: completed -->

## 2. Language adapters

- [x] 2.1 Define the language adapter contract for test declarations and whole-file command construction
<!-- covers: dod-guard/coverage-runtime :: Test-command resolution is language-aware and portable :: A supported language provides a whole-file command -->
<!-- status: completed -->
- [x] 2.2 Implement adapters for the currently supported language families and preserve unknown-extension skipping
<!-- covers: dod-guard/coverage-runtime :: Test-command resolution is language-aware and portable :: An unsupported test file does not create a binding -->
<!-- status: completed -->
- [x] 2.3 Add consumer-workspace runner configuration and explicit unresolved-command errors
<!-- covers: dod-guard/coverage-runtime :: Test-command resolution is language-aware and portable :: A language has no resolvable runner -->
<!-- status: completed -->

## 3. CLI integration

- [x] 3.1 Route the shell command through the shared structured report while preserving human-readable output and exit codes
<!-- covers: dod-guard/coverage-runtime :: Shell and plugin callers use the same engine :: Shell and plugin callers use the same engine -->
<!-- status: completed -->
- [x] 3.2 Keep unwired scenarios free of verification commands and preserve existing baseline comparison behavior
<!-- covers: dod-guard/coverage-gate :: cover reports a scenario's state :: No test binds a scenario -->
<!-- status: completed -->

## 4. Plugin-native interface

- [x] 4.1 Register a plugin-native coverage operation that accepts the consumer workspace and coverage scope
<!-- covers: dod-guard/coverage-runtime :: The installed plugin exposes the coverage engine :: A consumer invokes coverage after plugin installation -->
<!-- status: completed -->
- [x] 4.2 Resolve installed runtime resources without requiring consumer `PATH` or workspace configuration
<!-- covers: dod-guard/coverage-runtime :: The installed plugin exposes the coverage engine :: Shell and plugin callers use the same engine -->
<!-- status: completed -->
- [x] 4.3 Serialize structured scenario, verification, ratchet, and plan-check results for Pensieve
<!-- covers: dod-guard/coverage-runtime :: Plugin coverage results are structured :: An unwired scenario returns no verification command -->
<!-- status: completed -->

## 5. Consumer fixtures and regression tests

- [x] 5.1 Add a fixture consumer workspace that invokes the installed plugin surface without plugin-repository paths
<!-- status: completed -->
- [x] 5.2 Add marker-binding and command-resolution tests for TypeScript, Python, Go, Rust, Ruby, JVM, and shell adapters
<!-- covers: dod-guard/coverage-gate :: cover reports a scenario's state :: A marker binds a scenario to a test -->
<!-- status: completed -->
- [x] 5.3 Add tests proving shell and plugin-native callers return equivalent coverage results
<!-- covers: dod-guard/coverage-runtime :: Shell and plugin callers use the same engine :: Shell and plugin callers use the same engine -->
<!-- status: completed -->

## 6. Verification and documentation

- [ ] 6.1 Update plugin metadata and usage documentation with the installed-runtime coverage interface
- [ ] 6.2 Build the package, run its tests, and run the change-scoped coverage gate
<!-- covers: dod-guard/coverage-gate :: A marker binds a scenario to a test :: A marker binds a scenario to a test -->
