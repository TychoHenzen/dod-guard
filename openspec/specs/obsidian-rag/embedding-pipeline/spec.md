# Embedding Pipeline Specification

## Purpose

Defines optional semantic vectors for an Obsidian vault, and how the server
behaves when those vectors are unavailable. Scoring what a vector search
returns belongs to `obsidian-rag/note-search`. Walking the vault into chunks
belongs to `obsidian-rag/vault-indexing`. This capability covers only the
embedder itself and the storage, generation, and progress of vectors.

## Requirements

### Requirement: The embedder is an optional dependency loaded lazily

The server SHALL treat the embedding model as an optional dependency it does
not import at startup. It SHALL attempt to load the model only on first use,
and SHALL cache the loaded embedder for reuse afterward.

#### Scenario: Model package not installed
- **WHEN** the server first needs an embedder and the optional embedding
  package is not installed
- **THEN** the server returns no embedder rather than failing startup or the
  calling tool

#### Scenario: Model already loaded
- **WHEN** the server needs an embedder a second time after a successful load
- **THEN** it reuses the cached embedder instead of loading the model again

### Requirement: The embedder uses a fixed sentence-embedding model

When the embedding package is installed, the server SHALL load the
`Xenova/all-MiniLM-L6-v2` feature-extraction model and SHALL produce
mean-pooled, normalized vectors from it.

#### Scenario: Vector produced from text
- **WHEN** the embedder embeds a piece of text
- **THEN** the resulting vector is mean-pooled and normalized output of
  `Xenova/all-MiniLM-L6-v2`

### Requirement: Vectors are stored as binary blobs beside the legacy text column

The store SHALL persist each chunk's embedding as a binary blob of 32-bit
floats. It SHALL keep this blob column alongside the older JSON-text embedding
column, and SHALL read the blob directly into a float array without parsing
JSON.

#### Scenario: Reading stored vectors for search
- **WHEN** the store returns chunks that carry embeddings
- **THEN** each embedding arrives as a float array decoded from the blob
  column, with no JSON parse in that path

#### Scenario: Older row with only the text column
- **WHEN** a chunk was embedded before the blob column existed
- **THEN** the store migrates that row's embedding into the blob column so it
  can be read the same way

### Requirement: Vectors are generated during normal indexing

Indexing a vault or a single note SHALL generate embeddings for its chunks as
part of that same indexing operation, when an embedder is available. A
separate, explicit embedding request SHALL NOT be required to produce vectors
for content indexed in the ordinary flow.

#### Scenario: Vault indexed with an embedder available
- **WHEN** a vault is indexed and an embedder loaded successfully
- **THEN** the chunks produced by that indexing run carry embeddings once
  indexing completes

#### Scenario: Single note reindexed after a write
- **WHEN** a note is created, updated, or saved as a memory and reindexed
- **THEN** its chunks are embedded as part of that reindex, without a separate
  embedding step

### Requirement: Indexing accepts an embedder that may be absent

Indexing operations SHALL accept the embedder as an optional value. When no
embedder is available, indexing SHALL complete successfully and SHALL leave
the affected chunks without embeddings, rather than failing or blocking.

#### Scenario: Indexing runs with no embedder
- **WHEN** a vault or note is indexed and no embedder is available
- **THEN** indexing finishes without error and the resulting chunks carry no
  embeddings

#### Scenario: Embedding failure during indexing
- **WHEN** an embedder is available but a call to it fails while indexing runs
- **THEN** indexing does not abort as a whole, and the failure is surfaced
  rather than silently swallowed

### Requirement: Chunk texts are embedded in a single batched call

When embedding a group of chunks, the server SHALL hand every chunk's text to
the embedder in one batched call. It SHALL NOT issue one call per chunk.

#### Scenario: A batch of unembedded chunks is embedded
- **WHEN** the server embeds a set of chunks that currently lack vectors
- **THEN** it passes all of their texts to the embedder's batch operation in a
  single call and distributes the returned vectors back to their chunks

### Requirement: Background embedding returns a progress handle immediately

A request to embed a vault's remaining chunks SHALL start that work in the
background and return to the caller at once. It SHALL NOT wait for
embedding to finish. The background work SHALL process unembedded chunks in
batches until none remain, updating stored progress after each batch.

#### Scenario: Background embedding requested on a large vault
- **WHEN** the caller requests background embedding for a vault with many
  unembedded chunks
- **THEN** the call returns immediately, and embedding continues afterward in
  batches until every chunk is embedded

#### Scenario: No unembedded chunks remain
- **WHEN** background embedding runs and finds no chunk lacking a vector
- **THEN** it stops without performing any embedding call

### Requirement: Embedding progress is visible through the status tool

The server SHALL expose the count of chunks that carry embeddings through its
index-status reporting, and SHALL keep that count current as background
embedding proceeds.

#### Scenario: Checking status mid-embedding
- **WHEN** the caller checks index status while background embedding is still
  running
- **THEN** the reported embedded-chunk count reflects the batches completed so
  far, not only the count from before embedding started

### Requirement: Keyword search stays fully usable without an embedder

The server SHALL NOT require an embedder, or any embedded chunk, for keyword
search to function. A search or retrieval path that would use vectors SHALL
fall back to keyword-only behavior when no embedder is available. The same
fallback applies when no chunk in the vault carries an embedding. It SHALL
do so without loading the embedding model.

#### Scenario: Embedding package never installed
- **WHEN** the optional embedding package is not installed
- **THEN** keyword search continues to return results, and no attempt is made
  to load the embedding model to serve that search

#### Scenario: Vault has no embedded chunks yet
- **WHEN** a vault has been indexed but none of its chunks carry an embedding
- **THEN** a hybrid or semantic search request over that vault falls back to
  keyword results without loading the embedder
