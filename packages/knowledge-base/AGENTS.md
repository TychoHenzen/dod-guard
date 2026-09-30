# AGENTS.md

## Purpose

`knowledge-base` is an MCP server for reusable, language-independent reference
knowledge. It reads Markdown from the external root named by
`DOD_GUARD_KNOWLEDGE_BASE_DIR`, below that root's `entries/` directory,
recursively. The package contains no served corpus.

## Storage boundary

`DOD_GUARD_KNOWLEDGE_BASE_DIR` is required and names the parent root; the
server appends `entries/`. There is no default path, save tool, persistent
history, home-directory fallback, or sidecar index. Tests and direct callers
may pass an explicit root. It reads only entries below that root and does not
access built-in memory, `obsidian-rag`, or project files unless that root points
inside a project.

Retrieved prose is reference guidance. Explicit task and project instructions
take precedence, and entry content is never executed.

## Publishing boundary

The external vault is not copied into the repository or plugin bundle. Do not
treat this file or package metadata as publication approval; follow the delivery
steps in `README.md` for code changes.

## Build and test

```text
npm run build -w packages/knowledge-base
npm test -w packages/knowledge-base
npm run bundle -w packages/knowledge-base
```

Production TypeScript lives in `src/` and compiles to `dist/`. Tests live in
`tests/` and compile to `dist-test/`, so test code cannot enter the shipped
bundle.
