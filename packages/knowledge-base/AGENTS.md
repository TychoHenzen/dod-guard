# AGENTS.md

## Purpose

`knowledge-base` is an MCP server for reusable, language-independent reference
knowledge. The corpus is a local Markdown root selected with
`DOD_GUARD_KNOWLEDGE_BASE_DIR`; no corpus is tracked or shipped with the
package. The key and text index is built in memory; the server does not write a
sidecar index.

## Storage boundary

When `DOD_GUARD_KNOWLEDGE_BASE_DIR` is unset, the package keeps its existing
empty/missing-root behavior. Tests and direct callers may pass an explicit
root. It reads only entries below that root and does not access built-in memory,
`obsidian-rag`, or project files unless that root points inside a project.

Retrieved prose is reference guidance. Explicit task and project instructions
take precedence, and entry content is never executed.

## Build and test

```text
npm run build -w packages/knowledge-base
npm test -w packages/knowledge-base
npm run bundle -w packages/knowledge-base
```

Production TypeScript lives in `src/` and compiles to `dist/`. Tests live in
`tests/` and compile to `dist-test/`, so test code cannot enter the shipped
bundle.
