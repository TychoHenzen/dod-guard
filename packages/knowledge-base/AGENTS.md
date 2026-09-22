# AGENTS.md

## Purpose

`knowledge-base` is an MCP server for reusable, language-independent reference
knowledge. The only corpus is the tracked Markdown in `knowledge/entries/`,
shipped with the package. The key and text index is built in memory; the server
does not write a sidecar index.

## Storage boundary

The default root is `../knowledge/` relative to the built `dist/bundle.js`.
The server has no save tool, persistent history, home-directory fallback, or
environment-variable override. Tests and direct callers may pass an explicit
root. It reads only entries below that root and does not access built-in
memory, `obsidian-rag`, or project files unless that root points inside a
project.

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
