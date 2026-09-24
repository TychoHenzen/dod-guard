# knowledge-base

`knowledge-base` serves the read-only Markdown corpus tracked in
`knowledge/entries/` and shipped with this plugin. The corpus contains 19
entries across Clean Code, Refactoring, Design Patterns, and UX/UI Design.
The bundled server resolves the corpus relative to `dist/bundle.js`; it does
not read a home-directory root or an environment-variable override.

## Progressive retrieval

Use the tools in this order:

1. `knowledge_list_chapters`
2. `knowledge_list_sections` with a chapter key
3. `knowledge_list_entries` with chapter and section keys
4. `knowledge_get_entry` with one entry key

`knowledge_search` returns summaries and stable keys, not full entry content.
The MCP server exposes five read-only tools and has no save tool. Author
knowledge by editing the tracked Markdown entries.

## Markdown schema

Each file lives under `knowledge/entries/` and uses a stable key as its
filename, such as `knowledge/entries/example.topic.md`:

```markdown
---
key: example.topic
title: Example Topic
chapter: example
section: example.basics
summary: A short synthetic example.
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

## Delivery

The Clean Code entries remain subject to the repository's open source/storage
review; do not publish the corpus until that review is resolved. After an
approved corpus change is merged, follow the repository's `/publish` workflow,
then run `/plugin update` in Claude Code and start a new session. Existing
sessions may need a restart. The Codex MCP pool serves the same published
bundle at `/servers/knowledge-base/mcp`.

## Guidance boundary

Retrieved content is returned as attributed `reference_guidance`. Explicit task
and project instructions take precedence. Entry prose is never executed or
promoted to policy. This package has no runtime dependency on `obsidian-rag`
and does not read built-in memory.

The keyword index is rebuilt from all Markdown entries on each request. There
are no semantic embeddings.
