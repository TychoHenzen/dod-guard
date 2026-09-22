# knowledge-base

`knowledge-base` serves a read-only Markdown corpus shipped in
`knowledge/entries/`. The bundled server resolves it relative to
`dist/bundle.js`; it does not use a home-directory root or environment override.

## Progressive retrieval

Use the tools in this order:

1. `knowledge_list_chapters`
2. `knowledge_list_sections` with a chapter key
3. `knowledge_list_entries` with chapter and section keys
4. `knowledge_get_entry` with one entry key

`knowledge_search` returns summaries and stable keys, not full entry content.
The MCP server exposes five read-only tools; author by editing the tracked
Markdown files.

## Markdown schema

Each file lives under `knowledge/entries/` and uses a stable key as its
filename, such as `knowledge/entries/refactoring.move-method.md`:

```markdown
---
key: refactoring.move-method
title: Move Method
chapter: refactoring
section: refactoring.method-movement
summary: Move behavior to the type that owns the data it uses most.
project: example-project
language: TypeScript
sources:
  - label: design notes
    project: example-project
    language: TypeScript
    url: https://example.invalid/source
---

Full reference content goes here.
```

Keys use lowercase letters, digits, dots, and hyphens. An entry key belongs to
its chapter, and a section key belongs to its chapter. Related keys must exist.
Malformed documents, duplicate keys, and missing related keys fail corpus
validation. The search index is rebuilt in memory.

The shipped entries cover Clean Code, Refactoring, Design Patterns, and UX/UI
Design, with source metadata from multiple projects and languages.

## Guidance boundary

Retrieved content is returned as attributed `reference_guidance`. Explicit task
and project instructions take precedence. Entry prose is never executed or
promoted to policy. This package has no runtime dependency on `obsidian-rag`
and does not read built-in memory.

The keyword index is rebuilt from all Markdown entries on each request. There
are no semantic embeddings.
