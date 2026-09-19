# knowledge-base

`knowledge-base` is a local MCP server for reusable reference knowledge. It
stores Markdown documents under `~/.codex/knowledge-base` by default. Set
`DOD_GUARD_KNOWLEDGE_BASE_DIR` to choose another root.

## Progressive retrieval

Use the tools in this order:

1. `knowledge_list_chapters`
2. `knowledge_list_sections` with a chapter key
3. `knowledge_list_entries` with chapter and section keys
4. `knowledge_get_entry` with one entry key

`knowledge_search` returns summaries and stable keys. It does not return full
entry content. `knowledge_save` creates or refines one entry and records the
previous content and metadata in its refinement history.

## Markdown schema

Each file lives under `entries/` and uses a stable key as its filename, such as
`entries/refactoring.move-method.md`:

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
related_keys: []
history: []
---

Full reference content goes here.
```

Keys use lowercase letters, digits, dots, and hyphens. An entry key belongs to
its chapter, and a section key belongs to its chapter. Related keys must exist.
Malformed documents and duplicate keys stop index refresh before the previous
derived index is replaced.

The repository includes examples for Clean Code, Refactoring, Design Patterns,
and UX/UI Design. The examples use source metadata from more than one project
and language.

## Guidance boundary

Retrieved content is returned as attributed `reference_guidance`. Explicit task
and project instructions take precedence. Entry prose is never executed or
promoted to policy. This package has no runtime dependency on `obsidian-rag`
and does not read or write built-in memory.

The first slice deliberately uses a local keyword index and rebuilds it from
all Markdown entries on each request. It has no semantic embeddings or
cross-process writer lock. Add those only when corpus size or concurrent
writers make the measured limits relevant.
