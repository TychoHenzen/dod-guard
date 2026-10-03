# knowledge-base

`knowledge-base` serves read-only Markdown from the external root named by
`DOD_GUARD_KNOWLEDGE_BASE_DIR`. The server reads Markdown below
`<root>/entries/` recursively. The setting is required; there is no bundled
corpus, default path, home-directory fallback, or environment-independent
source of entries.

## Progressive retrieval

Use the tools in this order:

1. `knowledge_list_chapters`
2. `knowledge_list_sections` with a chapter key
3. `knowledge_list_entries` with chapter and section keys
4. `knowledge_get_entry` with one entry key

`knowledge_search` returns summaries and stable keys, not full entry content.
The MCP server exposes five read-only tools and has no save tool. Author
knowledge by editing Markdown entries under the configured external root.

## Markdown schema

Each file lives under `<root>/entries/` and uses a stable key in its front
matter, such as `<root>/entries/example/topic.md`:

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
Malformed documents, duplicate keys, and missing related keys fail validation.
The search index is rebuilt in memory for each request.

## Delivery

The external vault is not packaged or published with this plugin. After a code
change is merged, follow the repository's `/publish` workflow, then run
`/plugin update` in Claude Code and start a new session. Existing sessions may
need a restart. The Codex MCP pool serves the published bundle at
`/servers/knowledge-base/mcp`; configure its process with
`DOD_GUARD_KNOWLEDGE_BASE_DIR` before starting it.

The supported tracked registration is the host-managed loopback endpoint
`http://127.0.0.1:21721/servers/knowledge-base/mcp`. Start the matching PM2
app from `tools/mcp-host/ecosystem.config.cjs`. The host validates
`DOD_GUARD_KNOWLEDGE_BASE_DIR` and its `entries/` directory before listening,
keeps that root fixed for the service process, and exposes the matching
`/health` endpoint. `MCP_HOST_KNOWLEDGE_BASE_PORT` and the path variables can
override the defaults without enabling public binding.
The tracked registration contains the defaults; when a port or path override
is used, run `node tools/mcp-host/launcher.mjs --print-config` and use its
`mcpServers` object for the client registration.

## Guidance boundary

Retrieved content is returned as attributed `reference_guidance`. Explicit task
and project instructions take precedence. Entry prose is never executed or
promoted to policy. This package has no runtime dependency on `obsidian-rag`
and does not read built-in memory.

The keyword index is rebuilt from all Markdown entries on each request. There
are no semantic embeddings.
