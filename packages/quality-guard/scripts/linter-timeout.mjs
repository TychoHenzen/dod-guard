/**
 * Shared timeout for linters that need the whole crate, project, or solution
 * rather than a single file. Clippy (rust-linter.mjs) and dotnet format
 * analyzers (csharp-linter.mjs) both take longer than the per-file linters
 * in project-linter.mjs, so both read this constant instead of each
 * defining their own.
 */
export const WHOLE_PROJECT_TIMEOUT_MS = 60_000;
