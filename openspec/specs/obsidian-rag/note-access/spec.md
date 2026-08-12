# Note Access Specification

## Purpose

Defines how obsidian-rag reads and writes notes inside a selected vault. It
covers which backend answers each read, and how a note's frontmatter and
links are parsed. It also covers how a path is kept inside the vault, and
what the read and write tools expose. Search ranking lives in
`obsidian-rag/note-search`. Indexing
mechanics live in `obsidian-rag/vault-indexing`. Memory-entry tools live in
`obsidian-rag/memory-store`.

## Requirements

### Requirement: The index and filesystem are the single source of truth for reads

Every read tool SHALL answer from the SQLite index or the vault filesystem,
never from the external Obsidian command-line tool. The command-line tool
SHALL be used for vault discovery only. A read tool SHALL NOT shell out to the
command-line tool to satisfy `read_note`, `list_notes`, `get_links`,
`get_tags`, or `index_status`.

#### Scenario: Reading a note
- **WHEN** `read_note` is called with a selected vault
- **THEN** the server reads the note from the vault filesystem and does not
  invoke the Obsidian command-line tool

#### Scenario: Listing notes
- **WHEN** `list_notes` is called
- **THEN** the server answers from the SQLite index and does not invoke the
  Obsidian command-line tool

### Requirement: Reading a note returns its parsed content

`read_note` SHALL return the note's title, tags, and body content for a given
vault-relative path. A missing note SHALL produce a "Note not found" error
rather than a generic failure.

#### Scenario: Note exists
- **WHEN** `read_note` is called with a path that exists in the selected vault
- **THEN** the response includes the note's title, its tags, and its body
  content

#### Scenario: Note does not exist
- **WHEN** `read_note` is called with a path that has no file on disk
- **THEN** the response reports "Note not found" for that path and is marked
  as an error

### Requirement: Listing notes can be filtered by directory

`list_notes` SHALL list every indexed note in the selected vault. When a
caller supplies a subdirectory, `list_notes` SHALL narrow that list to notes
under it.

#### Scenario: No directory given
- **WHEN** `list_notes` is called with no directory
- **THEN** every indexed note in the vault is listed

#### Scenario: Directory given
- **WHEN** `list_notes` is called with a subdirectory
- **THEN** only notes under that subdirectory are listed

#### Scenario: No notes match
- **WHEN** the vault, or the given subdirectory, holds no indexed notes
- **THEN** the response reports that no notes were found, naming the
  directory if one was given

### Requirement: Get links returns forward links and backlinks

`get_links` SHALL return the wikilinks a note points to and the notes that
point back to it. Forward links SHALL come from parsing the note's own
content. Backlinks SHALL come from scanning every indexed note's stored links
for a match on the target path, its extension-stripped form, or its base
name.

#### Scenario: Note with outgoing links
- **WHEN** `get_links` is called on a note whose content holds wikilinks
- **THEN** the response lists each linked target under forward links

#### Scenario: Note with no outgoing links
- **WHEN** `get_links` is called on a note whose content holds no wikilinks
- **THEN** the response reports no forward links

#### Scenario: Note referenced elsewhere
- **WHEN** another indexed note links to the target note
- **THEN** that other note's path appears under backlinks

### Requirement: Get tags aggregates tags with note counts

`get_tags` SHALL return every tag used anywhere in the selected vault's index.
Each tag SHALL be paired with the count of notes carrying it, sorted from
most to least used.

#### Scenario: Vault with tagged notes
- **WHEN** `get_tags` is called on a vault whose notes carry frontmatter tags
- **THEN** the response lists each distinct tag with how many notes carry it,
  most-used first

### Requirement: Index status reports indexing progress

For the selected vault, `index_status` SHALL report how many notes are
indexed against the total, and how many chunks exist. It SHALL also report
how many of those chunks carry an embedding, and when the vault was last
indexed.

#### Scenario: Status requested
- **WHEN** `index_status` is called on a selected vault
- **THEN** the response holds the indexed and total note counts, the chunk
  count, the embedded chunk count, and the last-indexed time or "never"

### Requirement: Creating or updating a note reindexes it immediately

`create_note` SHALL write a note's content and frontmatter to the vault. It
SHALL either overwrite the note or append to its existing content, depending
on the caller's request. After a successful write, the server SHALL reindex
that single note so it is searchable without a full reindex.

#### Scenario: New note created
- **WHEN** `create_note` is called with a path that does not yet exist
- **THEN** the note is written to the vault and then indexed

#### Scenario: Existing note overwritten
- **WHEN** `create_note` is called on an existing path with `append` false
- **THEN** the note's content is replaced and then reindexed

#### Scenario: Existing note appended
- **WHEN** `create_note` is called on an existing path with `append` true
- **THEN** the new content is added after the note's existing content and the
  note is then reindexed

### Requirement: Three resources expose vaults, tags, and notes

The server SHALL expose three resources. `obsidian://vaults` SHALL list known
vaults. `obsidian://tags` SHALL list tags with counts for the selected vault.
`obsidian://notes/{path}` SHALL return a single note's raw content by path.

#### Scenario: Tags resource with no vault selected
- **WHEN** `obsidian://tags` is read before any vault is selected
- **THEN** the resource reports that no vault is selected rather than
  failing

#### Scenario: Note resource for a missing note
- **WHEN** `obsidian://notes/{path}` is read for a path with no file on disk
- **THEN** the resource reports that the note was not found

### Requirement: Frontmatter is parsed into structured metadata

A note's frontmatter SHALL be parsed into title, tags, creation time, and
modification time, alongside the raw frontmatter object. Tags SHALL be
accepted as either a list or a comma-separated string, and a leading `#` on a
tag SHALL be stripped. A note with no title in frontmatter SHALL fall back to
its file name.

#### Scenario: Tags as a comma-separated string
- **WHEN** a note's frontmatter holds tags as a comma-separated string
- **THEN** each tag is split out and its leading `#`, if present, is
  stripped

#### Scenario: No title in frontmatter
- **WHEN** a note's frontmatter holds no title
- **THEN** the note's file name, without its extension, is used as the title

### Requirement: Wikilinks are extracted from note content

Wikilink extraction SHALL find every `[[target]]` occurrence in a note's
content, strip any heading anchor or display alias, trim whitespace, and
deduplicate the result. A link naming only a heading anchor SHALL be
rejected.

#### Scenario: Link with an anchor and an alias
- **WHEN** content holds `[[Note#section|display text]]`
- **THEN** the extracted link is `Note`

#### Scenario: Anchor-only link
- **WHEN** content holds `[[#section]]`
- **THEN** no link is extracted for it

### Requirement: A note path cannot resolve outside the vault

Every read and write of a note SHALL resolve the note's real path with
symlinks followed. It SHALL reject the operation when that real path falls
outside the vault's real root. This check SHALL catch both a literal `../`
segment and a symlink that points outside the vault.

#### Scenario: Path traversal via relative segments
- **WHEN** a note path holds `../` segments that would resolve outside the
  vault root
- **THEN** the operation is rejected with a path traversal error and no file
  is read or written

#### Scenario: Path traversal via backslash segments
- **WHEN** a note path holds `..\` segments that would resolve outside the
  vault root
- **THEN** the operation is rejected with a path traversal error

### Requirement: A read tool errors rather than guessing a vault

Every tool that reads or writes notes SHALL require a selected vault. When no
vault has been selected and none is in the middle of being selected, the tool
SHALL return a clear error. It SHALL NOT silently choose or index a vault on
the caller's behalf.

#### Scenario: No vault selected
- **WHEN** a note-access tool is called before `vault_select` has been called
- **THEN** the tool reports that no vault is selected rather than picking one
  automatically

### Requirement: Vault discovery degrades gracefully without the external tool

`vault_list` SHALL report when the Obsidian command-line tool is unavailable,
rather than failing outright. It SHALL still report an empty vault list
distinctly from a tool-unavailable condition.

#### Scenario: Command-line tool not installed
- **WHEN** `vault_list` is called and the Obsidian command-line tool cannot be
  reached or started
- **THEN** the response says the app is not running and could not be started,
  rather than throwing an unhandled error

#### Scenario: Tool available but no vaults configured
- **WHEN** the command-line tool is reachable but reports no vaults
- **THEN** the response tells the caller to open Obsidian or check the vault
  configuration

### Requirement: Errors surface rather than being swallowed

A failure reading or writing a note SHALL be reported back to the caller with
enough detail to act on it. That report SHALL distinguish a missing note from
any other failure. Aggregation across many notes, such as tag counting, SHALL skip a
single broken note rather than aborting the whole operation. It SHALL NOT
report that note's failure as a false empty result for the whole vault.

#### Scenario: Read fails for a reason other than a missing file
- **WHEN** `read_note` or `get_links` fails for a reason other than the note
  being missing
- **THEN** the response names the action that failed and the underlying error
  message, and is marked as an error

#### Scenario: One broken note among many during tag aggregation
- **WHEN** tag aggregation encounters one note it cannot parse
- **THEN** that note is skipped and the tags from every other note are still
  reported
