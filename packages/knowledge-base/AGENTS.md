# AGENTS.md

## Purpose

`knowledge-base` is a local MCP server for reusable, language-independent
reference knowledge. Markdown files under the configured root are the source of
truth. `.knowledge-index.json` is a derived key and text index.

## Storage boundary

The default root is `~/.codex/knowledge-base`. Set
`DOD_GUARD_KNOWLEDGE_BASE_DIR` to use another root. The package never reads or
writes built-in memory, `obsidian-rag`, or project files unless the configured
knowledge-base root is inside that project.

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
