# obsidian-rag/rag-memory Specification

## Purpose
Skill that searches, reads, and writes an Obsidian vault through the obsidian-rag MCP server, providing context retrieval, memory operations, and knowledge graph traversal.

## Requirements

### Requirement: vault selection before any operation
The skill SHALL select a vault with `vault_select` before calling any other obsidian-rag tool. When no vault name is given, the skill SHALL call `vault_list` and pick the single vault or ask the user to choose.

#### Scenario: single vault auto-selects
- **WHEN** the user invokes `/rag-memory` without naming a vault and `vault_list` returns exactly one vault
- **THEN** the skill calls `vault_select` with that vault's name without prompting the user

#### Scenario: multiple vaults require a choice
- **WHEN** the user invokes `/rag-memory` without naming a vault and `vault_list` returns more than one vault
- **THEN** the skill asks the user which vault to use before proceeding

### Requirement: context retrieval uses semantic search
The skill SHALL use `search_notes` for free-text queries and `get_tags` or `get_links` for structured traversal. It SHALL NOT read notes one by one to find information.

#### Scenario: free-text question triggers search
- **WHEN** the user asks a question about vault content without naming a specific note
- **THEN** the skill calls `search_notes` with the query and presents the top results

#### Scenario: structured traversal via links
- **WHEN** the user asks what connects to a specific note
- **THEN** the skill calls `get_links` on that note and reports forward links and backlinks

#### Scenario: tag-based exploration
- **WHEN** the user asks about the vault's tag taxonomy or what topics exist
- **THEN** the skill calls `get_tags` and presents the tag distribution

### Requirement: note creation follows Obsidian conventions
The skill SHALL create notes via `create_note` with a title and Markdown body. Tags SHALL use Obsidian's `#tag` format. Internal links SHALL use `[[note-name]]` format.

#### Scenario: new note with tags and links
- **WHEN** the user asks to create a note that references other notes and has tags
- **THEN** the created note body contains `[[target]]` wiki-links and `#tag` markers, not plain text references

#### Scenario: append to an existing note
- **WHEN** the user asks to add content to a daily note or running log
- **THEN** the skill calls `create_note` with `append: true` and adds to the existing note without replacing it

### Requirement: memory operations persist across sessions
The skill SHALL use `memory_save` to store facts the user asks to remember, and `memory_recall` to retrieve them. Each memory SHALL have a descriptive key.

#### Scenario: save and recall a memory
- **WHEN** the user says "remember that X" and later asks "what did I say about X"
- **THEN** the skill calls `memory_save` with a key derived from the subject, and `memory_recall` with the same key returns the saved content

#### Scenario: saved memory is immediately searchable
- **WHEN** `memory_save` completes a write
- **THEN** the saved memory is findable by `memory_recall` without a manual reindex, because `memory_save` auto-indexes via `indexNote`

#### Scenario: browsing memories by type
- **WHEN** the user asks to list all saved memories or memories of a specific type
- **THEN** the skill calls `memory_list` and groups entries under their type (`user`, `feedback`, `project`, or `reference`)

#### Scenario: reindex after external vault changes
- **WHEN** the user has added or edited notes outside of Obsidian or this skill
- **THEN** the skill calls `reindex` before searching, so the index reflects the current vault state
