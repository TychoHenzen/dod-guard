---
name: rag-memory
description: >-
  Search, read, and write an Obsidian vault through the obsidian-rag MCP server —
  hybrid semantic + keyword search over notes, backlink and tag traversal, note
  creation, and structured memory save/recall that persists across sessions.
  TRIGGER when: the user mentions their vault, notes, or Obsidian; asks to
  remember or recall something across sessions; asks what was decided or learned
  previously; wants to search personal knowledge rather than the codebase; or says
  "save this to memory", "check my notes", "what do I have on X".
  DO NOT TRIGGER for searching code in the current repo — use Grep/Glob for that.
---

# RAG Memory Skill

Use when working with Obsidian vaults via the obsidian-rag MCP plugin. Provides workflows for searching notes, retrieving context, saving memories, and traversing knowledge graphs.

## Quick Start

1. Select a vault: `vault_select` tool with your vault name
2. Search: `search_notes` for semantic/keyword search
3. Read: `read_note` to get full note content

## Workflows

### Context Retrieval (RAG)

When you need relevant context from your knowledge base:
1. Use `search_notes` with your query — this performs hybrid search across all notes
2. For each relevant result, use `read_note` to get the full content
3. Use `get_links` to explore connected notes (forward + backlinks)

### Memory Operations

The vault's `Claude-Memories/` directory stores structured memory entries compatible with Claude Code's memory system:
- `memory_save` — save a new memory or update existing
- `memory_recall` — semantic search over saved memories
- `memory_list` — browse all memories by type

Memory types: `user`, `feedback`, `project`, `reference`

Entries land in `Claude-Memories/<type>/<id>.md` — note the capitalisation, and
that it is not a dotfile. `memory_save` reindexes the single note it wrote, so a
saved memory is searchable immediately.

### Knowledge Graph Traversal

- `get_tags` — discover tag taxonomy and distribution
- `get_links` on a note — find related notes via wikilinks
- Follow `[[wikilinks]]` in note content to explore connections

### Note Creation

- `create_note` — create or append to notes
- Frontmatter (title, tags, dates) is managed automatically
- Use `append: true` to add to daily notes or running logs

## Tips

- The vault must be indexed first — happens automatically on `vault_select`
- Use `reindex` after bulk note changes outside of Obsidian
- Semantic search requires `@xenova/transformers` (optional, local, no API calls)
- Install the obsidian-rag plugin to auto-enable this skill
