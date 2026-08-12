# Note Search Specification

## Purpose

Defines how a caller finds a note in an indexed vault: by keyword, by meaning,
or by a blend of both. Vector generation belongs to
`obsidian-rag/embedding-pipeline`, building the index belongs to
`obsidian-rag/vault-indexing`, and recalling saved memories belongs to
`obsidian-rag/memory-store`. This capability only covers turning a query
string into ranked `SearchResult` rows.

## Requirements

### Requirement: Three search modes are available

The system SHALL offer keyword search, semantic search, and hybrid search over
an indexed vault. Keyword search SHALL use the FTS5 index. Semantic search
SHALL use cosine similarity over stored embeddings. Hybrid search SHALL
combine both.

#### Scenario: Keyword-only query
- **WHEN** a caller runs a keyword search
- **THEN** the system returns results ranked by the FTS5 index alone, with
  `matchType` set to `keyword`

#### Scenario: Semantic-only query
- **WHEN** a caller runs a semantic search
- **THEN** the system returns results ranked by cosine similarity to the query
  embedding, with `matchType` set to `semantic`

#### Scenario: Hybrid query
- **WHEN** a caller runs a hybrid search
- **THEN** the system returns results ranked by a merged score, with
  `matchType` set to `hybrid`

### Requirement: Keyword search ranks by the FTS5 engine and strips markup from snippets

The system SHALL run the keyword query through SQLite FTS5, order results by
FTS5 rank, and derive each result's score from that rank so a better rank
yields a higher score. The system SHALL strip the engine's highlight markers
from the returned snippet text.

#### Scenario: Two matches, one ranked higher by FTS5
- **WHEN** an FTS5 keyword search returns two notes with different ranks
- **THEN** the note with the better FTS5 rank gets the higher score

#### Scenario: Snippet carries highlight markers
- **WHEN** the FTS5 engine wraps a matched term in its highlight markers
- **THEN** the returned snippet has those markers removed

### Requirement: A query is sanitized before it reaches the FTS5 engine

The system SHALL strip characters the FTS5 engine reads as syntax, including
`*`, `(`, `)`, `:`, `^`, `~`, and `-`, before matching. It SHALL escape a
double quote so it cannot open FTS5 phrase syntax. It SHALL quote the boolean
keywords AND, OR, NOT, and NEAR so they are searched as literal words rather
than interpreted as operators. An empty or all-stripped query SHALL match no
rows rather than every row.

#### Scenario: Query holds an FTS5 special character
- **WHEN** a keyword query contains a character such as `*` or `(` that FTS5
  reads as syntax
- **THEN** the system strips it before matching so the search does not fail on
  it

#### Scenario: Query holds a boolean keyword
- **WHEN** a keyword query contains the word AND, OR, NOT, or NEAR
- **THEN** the system treats it as literal search text rather than as an FTS5
  operator

#### Scenario: Query is empty after sanitizing
- **WHEN** a keyword query is empty, or becomes empty once syntax characters
  are stripped
- **THEN** the system returns no rows for it

### Requirement: Keyword search falls back to a substring match on FTS5 failure

When a sanitized query still fails FTS5 parsing, the system SHALL fall back to
a plain substring match against note title and content instead of raising the
error to the caller.

#### Scenario: FTS5 rejects a sanitized query
- **WHEN** the FTS5 engine cannot parse a query even after sanitizing
- **THEN** the system falls back to a substring match over note title and
  content and still returns results

### Requirement: Semantic search compares embeddings by cosine similarity read from binary storage

The system SHALL compute cosine similarity between the query embedding and
each stored chunk embedding by reading the stored vector directly from its
binary representation, with no per-query JSON parsing of stored vectors. It
SHALL rank chunks by similarity descending and SHALL return at most one result
per note, keeping the highest-similarity chunk for that note.

#### Scenario: Same note has two matching chunks
- **WHEN** semantic search finds two chunks from the same note among the
  ranked candidates
- **THEN** the system returns only the highest-ranked chunk's result for that
  note

#### Scenario: Comparing a query embedding against a stored embedding
- **WHEN** the system scores a stored chunk embedding against the query
  embedding
- **THEN** it reads the stored embedding from its binary column rather than
  parsing it from JSON

### Requirement: Semantic and hybrid search skip loading the embedder when no vector exists

The system SHALL check whether the vault has any embedded chunks before
loading an embedding model. When no embedded chunks exist, semantic search
SHALL return no results and hybrid search SHALL return keyword-only results,
in both cases without loading the embedder.

#### Scenario: Vault has zero embedded chunks
- **WHEN** semantic search runs against a vault with zero embedded chunks
- **THEN** the system returns no results and never loads the embedding model

#### Scenario: Hybrid search with no embeddings yet
- **WHEN** hybrid search runs against a vault with zero embedded chunks
- **THEN** the system returns keyword results alone, tagged as hybrid matches,
  without loading the embedding model

#### Scenario: No embedder supplied at all
- **WHEN** hybrid search runs with no embedder available
- **THEN** the system returns keyword results alone, tagged as hybrid matches

### Requirement: Hybrid search merges keyword and semantic scores by fixed weight

The system SHALL run keyword search and semantic search over a wider candidate
pool than the requested limit, then merge them by note path. For a note found
by only one engine, the system SHALL scale that engine's score by its weight.
For a note found by both engines, the system SHALL sum each engine's weighted
score. The system SHALL sort the merged results by combined score descending
and return at most the requested number.

#### Scenario: Note found by keyword search only
- **WHEN** a note appears in the keyword results but not the semantic results
- **THEN** its hybrid score is its keyword score scaled by the keyword weight

#### Scenario: Note found by both engines
- **WHEN** a note appears in both the keyword results and the semantic results
- **THEN** its hybrid score is the sum of its weighted keyword score and its
  weighted semantic score

#### Scenario: Snippet missing from the semantic side
- **WHEN** a note's keyword result carries a snippet and its semantic result
  does not add one
- **THEN** the merged result keeps the keyword snippet rather than an empty
  one

### Requirement: A dimension mismatch between query and stored embeddings raises a clear error

The system SHALL compare the query embedding's length against a stored
embedding's length before scoring. When the lengths differ, it SHALL raise an
error naming both lengths and pointing at reindexing with embeddings enabled,
rather than silently returning a zero similarity.

#### Scenario: Stored embedding has a different dimension than the query embedding
- **WHEN** semantic search compares a query embedding against a stored
  embedding of a different length
- **THEN** the system raises an error naming both dimensions instead of
  returning a similarity of zero
