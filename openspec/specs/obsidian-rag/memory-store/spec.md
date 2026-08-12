# Memory Store Specification

## Purpose

Defines memories that survive a session: structured notes an agent saves into
the vault, then recalls or lists later. It covers the memory file format, the
directory memories live in, and how a save becomes immediately recallable.
The keyword and semantic search stack itself belongs to `obsidian-rag/note-search`,
single-note reindexing belongs to `obsidian-rag/vault-indexing`, and ordinary
note reading and writing belongs to `obsidian-rag/note-access`.

## Requirements

### Requirement: Memories live under Claude-Memories, one subfolder per type

The system SHALL store every memory as a markdown file under a `Claude-Memories`
directory at the vault root. It SHALL place each memory inside a subfolder
named for its type, and SHALL name the file after the memory id.

#### Scenario: Saving a reference memory
- **WHEN** a memory with id `mem-1` and type `reference` is saved
- **THEN** the system writes it to `Claude-Memories/reference/mem-1.md`

#### Scenario: Nested memory id
- **WHEN** a memory is saved with an id containing a slash, such as
  `project/memory-name`
- **THEN** the system preserves that nesting inside the type subfolder

### Requirement: A saved memory carries frontmatter a Claude Code memory reader accepts

The system SHALL write each memory as a markdown file whose frontmatter holds
a name, a description, a type, a metadata object, and created and modified
timestamps. It SHALL accept a title, a one-line description, a markdown body,
a memory type, and optional metadata key-value pairs from the caller.

#### Scenario: Frontmatter fields set on save
- **WHEN** a memory is saved with a title, a description, and a content body
- **THEN** the written file's frontmatter holds the title as `name`, the
  description, the type, and a `created` and `modified` timestamp, and the
  file body holds the content

#### Scenario: Type defaults when the caller omits one
- **WHEN** a memory is saved with no type given
- **THEN** the system stores it under the `reference` type

### Requirement: Overwrite of an existing memory is guarded

The system SHALL refuse to overwrite a memory whose id already exists on disk
when the caller disables overwrite, and SHALL overwrite it by default.

#### Scenario: Overwrite disabled on an existing id
- **WHEN** a memory is saved with an id that already exists and the caller
  sets overwrite to false
- **THEN** the system reports the conflict as an error and does not modify
  the existing file

#### Scenario: Overwrite left at its default
- **WHEN** a memory is saved with an id that already exists and the caller
  does not disable overwrite
- **THEN** the system replaces the existing file with the new content

### Requirement: A saved memory is immediately recallable

The system SHALL reindex the single note it just wrote after every memory
save, without requiring a separate reindex step.

#### Scenario: Recall right after save
- **WHEN** a memory is saved and then recalled by a query matching its content
- **THEN** the recall finds it, because the save indexed that one note before
  returning

### Requirement: Recall searches the same stack as note search, scoped to memories

The system SHALL run memory recall through the same keyword and semantic
search path used for general note search, and SHALL restrict the results to
files under the `Claude-Memories` path.

#### Scenario: Recall query
- **WHEN** a natural-language query is submitted for recall
- **THEN** the system ranks matching memories by the same scoring the general
  search stack produces, and returns only memory-path results

#### Scenario: A matching note outside Claude-Memories
- **WHEN** a search would otherwise match a note stored outside the memory
  directory
- **THEN** recall excludes that result

### Requirement: Memories can be listed without a search query

The system SHALL list every saved memory by reading the memory directory
from the filesystem, grouped by type, each entry showing its title,
description, and id.

#### Scenario: Listing with memories present
- **WHEN** the memory list is requested and memories exist under
  `Claude-Memories`
- **THEN** the system returns every memory found on disk, grouped by type

#### Scenario: Listing with no memories saved
- **WHEN** the memory list is requested and the memory directory holds no
  files
- **THEN** the system reports that no memories exist
