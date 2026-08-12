# Vault Indexing Specification

## Purpose

Turns a vault of markdown files into a searchable local index: notes, headings-aware
chunks, and the tables that keyword and vector search read from. Covers selecting a
vault, walking it, chunking and hashing content, and keeping the index consistent as
notes are added, edited, or deleted. Generating vectors for a chunk belongs to
`obsidian-rag/embedding-pipeline`. Reading and writing note files belongs to
`obsidian-rag/note-access`. Querying the index belongs to `obsidian-rag/note-search`.

## Requirements

### Requirement: Vault selection resolves a name or a direct path

The system SHALL resolve a vault either by a known name or by a filesystem path
supplied directly. It SHALL record the selected vault so later tool calls do not
need to repeat it.

#### Scenario: Selecting by known name
- **WHEN** a caller selects a vault by a name already recorded in the store
- **THEN** the system resolves it to that vault's path without requiring the path again

#### Scenario: Selecting by direct path
- **WHEN** a caller supplies a vault path that is not yet known
- **THEN** the system accepts the path directly and indexes it

#### Scenario: No vault selected
- **WHEN** a tool that reads the index runs before any vault has been selected
- **THEN** the system reports that no vault is selected instead of guessing one

### Requirement: A full index walk covers every markdown file in the vault

The system SHALL walk the vault directory recursively and collect every file whose
name ends in `.md`. It SHALL skip hidden directories during that walk. It SHALL
record each file's path relative to the vault root using forward slashes
regardless of platform.

#### Scenario: Nested markdown files
- **WHEN** the vault holds markdown files several directories deep
- **THEN** the walk collects all of them, not only files at the vault root

#### Scenario: Hidden directory present
- **WHEN** a directory name starts with a dot
- **THEN** the walk does not descend into it

#### Scenario: Windows path separators
- **WHEN** the walk runs on a platform whose native path separator is a backslash
- **THEN** recorded note paths still use forward slashes

### Requirement: Chunking is heading-aware, bounded, and keeps code blocks intact

The system SHALL split a note's content into sections at markdown headings (`#`
through `######`). It SHALL carry the nearest heading as breadcrumb text on each
chunk. It SHALL accumulate section text into a chunk up to a maximum size. When it
splits a chunk, it SHALL carry a fixed amount of trailing text from that chunk into
the next one as overlap. A heading marker appearing inside a fenced code block SHALL NOT
start a new section. The code fence SHALL never be split across chunks by that
rule. A note whose content does not cross the size limit SHALL still produce
exactly one chunk.

#### Scenario: Heading marks section
- **WHEN** a note contains two headings each followed by short text
- **THEN** the chunk under the second heading carries that heading, not the first

#### Scenario: Long content forces a split
- **WHEN** a note's content exceeds the chunk size limit
- **THEN** chunking produces more than one chunk, and a chunk after the first carries
  text carried over from the end of the one before it

#### Scenario: Heading text inside a code block
- **WHEN** a line that looks like a markdown heading appears between two code fence
  markers
- **THEN** chunking does not treat it as a section break

#### Scenario: Short note
- **WHEN** a note's content is small enough to fit in one chunk
- **THEN** chunking produces exactly one chunk, even for an empty note

### Requirement: Chunk identifiers are stable and unique within a note

The system SHALL assign each chunk an identifier built from the note's path and the
chunk's position within that note. Chunk identifiers within one note SHALL never
repeat, and the same input SHALL always reproduce the same identifiers.

#### Scenario: Many chunks from one note
- **WHEN** a single note produces many chunks
- **THEN** every chunk identifier for that note is distinct

### Requirement: A content hash drives incremental indexing

The system SHALL compute a stable hash of a note's content. It SHALL skip
re-chunking and re-storing a note whose stored hash still matches its current
content. It SHALL treat any change to the content as requiring re-indexing.

#### Scenario: Unchanged note
- **WHEN** a full index walk reaches a note whose content hash matches what is
  already stored for it
- **THEN** the system counts the note as indexed without deleting or re-inserting its
  chunks

#### Scenario: Changed note
- **WHEN** a note's content differs from what produced its stored hash
- **THEN** the system re-chunks and re-stores it

#### Scenario: Hash is stable and content-sensitive
- **WHEN** the same content is hashed twice
- **THEN** both hashes are equal, and hashing different content produces a different
  hash

### Requirement: Re-indexing a note deletes its old chunks before inserting new ones

The system SHALL delete every existing chunk belonging to a note before it inserts
that note's newly computed chunks. This way, a note that now produces fewer chunks
than before leaves no orphaned chunks behind.

#### Scenario: Note shrinks
- **WHEN** a previously indexed note that produced several chunks is re-indexed with
  much shorter content that now produces only one chunk
- **THEN** the index holds exactly the new chunk for that note and none of the old
  ones

### Requirement: A full index walk reconciles the index against the filesystem

After walking and indexing every markdown file found on disk, the system SHALL
reconcile the index against the filesystem. It SHALL compare the set of notes
recorded in the index against the files that still exist. It SHALL then remove any
note whose file is no longer present. That removal SHALL cover both the note table
and the chunk table.

#### Scenario: Note deleted from disk
- **WHEN** the index holds a note whose file has been removed from the vault since
  the last index walk
- **THEN** a full index walk removes that note and its chunks from the index

#### Scenario: Note still present
- **WHEN** every indexed note still has a corresponding file on disk
- **THEN** the reconciliation pass removes nothing

### Requirement: A single note can be indexed without a full walk

The system SHALL support indexing one named note independently of a full vault walk.
It SHALL perform the same delete-then-insert chunk replacement as the full walk. So
a note just written is immediately reflected in the index without waiting on a full
reindex.

#### Scenario: Note written then indexed
- **WHEN** a single note is indexed right after its content is written
- **THEN** the index holds that note's current content and chunks, ready to be found
  by search

#### Scenario: Single-note indexing failure is contained
- **WHEN** indexing a single note fails, for example because the note cannot be read
- **THEN** the system does not propagate that failure to the caller as a rejection

### Requirement: The index schema separates notes, chunks, vectors, and the keyword index

The system SHALL persist indexed data in four kinds of tables. One table SHALL hold
note metadata and content per vault. Another SHALL hold chunks belonging to a note,
each carrying its heading breadcrumb. A vector column SHALL be associated with each
chunk. A keyword index SHALL be built from note title, content, and tags. The
system SHALL scope every one of those tables by vault, so that two vaults never
mix data. Generating the vector values themselves is out of scope for this
capability. See `obsidian-rag/embedding-pipeline`. Querying these tables is out of
scope for this capability. See `obsidian-rag/note-search`.

#### Scenario: Two vaults stay separate
- **WHEN** two different vaults have each been indexed
- **THEN** a note path that exists in both is stored and retrievable independently
  per vault

#### Scenario: Chunk carries a vector slot
- **WHEN** a chunk is stored before any vector has been generated for it
- **THEN** the chunk still exists in the index with its vector slot empty

### Requirement: The index refuses to install anything at run time

The system SHALL NOT attempt to install missing runtime dependencies itself. When a
required native dependency is missing, it SHALL fail with an error. That error
SHALL name the missing dependency and the exact command to run to install it. It SHALL NOT
degrade silently or attempt an install.

#### Scenario: Native dependency missing
- **WHEN** the database layer's required native module cannot be loaded
- **THEN** the system raises an error that names the missing package and states the
  install command to run, instead of trying to install it automatically
