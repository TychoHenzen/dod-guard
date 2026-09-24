# knowledge-base

`knowledge-base` serves read-only Markdown entries from a local root configured
with `DOD_GUARD_KNOWLEDGE_BASE_DIR`. The package does not track or ship a
corpus. When the variable is unset, the server keeps the existing
empty/missing-root behavior.

For this machine, configure the private vault in PowerShell:

```powershell
$env:DOD_GUARD_KNOWLEDGE_BASE_DIR = 'C:\Obsidian\Knowledgebase'
```

The root contains an `entries/` directory. The server never writes to it.

## Progressive retrieval

Use the tools in this order:

1. `knowledge_list_chapters`
2. `knowledge_list_sections` with a chapter key
3. `knowledge_list_entries` with chapter and section keys
4. `knowledge_get_entry` with one entry key

`knowledge_search` returns summaries and stable keys, not full entry content.
The MCP server exposes five read-only tools and has no save tool. Author
knowledge by editing Markdown entries in the configured local root.

## Markdown schema

Each file lives under the configured root's `entries/` directory and uses a
stable key as its filename, such as `entries/example.topic.md`:

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

This package contains no knowledge content to publish. Changes to local vault
entries stay outside the repository.

## Guidance boundary

Retrieved content is returned as attributed `reference_guidance`. Explicit task
and project instructions take precedence. Entry prose is never executed or
promoted to policy. This package has no runtime dependency on `obsidian-rag`
and does not read built-in memory.

The keyword index is rebuilt from all Markdown entries on each request. There
are no semantic embeddings.
