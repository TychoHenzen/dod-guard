// Retrieval: keyword search (FTS5) + semantic search (cosine similarity on embeddings)

import type { Store } from "./store.js";
import type { SearchResult } from "./types.js";

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ── Keyword search ────────────────────────────────────────────────────

export function keywordSearch(store: Store, vaultName: string, query: string, limit = 20): SearchResult[] {
  const rows = store.searchNotesFTS(vaultName, query, limit);
  return rows.map((r) => ({
    notePath: r.path,
    title: r.title,
    heading: "",
    snippet: stripMarks(r.snippet),
    score: r.score,
    matchType: "keyword" as const,
  }));
}

// ── Semantic search ───────────────────────────────────────────────────

export async function semanticSearch(
  store: Store,
  vaultName: string,
  query: string,
  embedder: Embedder,
  limit = 20,
): Promise<SearchResult[]> {
  // Fast-path: no embeddings available — skip model load
  const status = store.getIndexStatus(vaultName);
  if (status.embeddedChunks === 0) return [];

  const queryEmbedding = await embedder.embed(query);

  // Use BLOB path: direct Float32Array, no JSON.parse per chunk
  const chunks = store.getChunksWithEmbeddings(vaultName);
  if (chunks.length === 0) return [];

  // Compute cosine similarity over Float32Arrays
  const scored = chunks.map((chunk) => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embeddingVector);
    return { chunk, similarity };
  });

  // Sort by similarity descending
  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored.slice(0, limit);

  // Deduplicate by note
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const { chunk, similarity } of top) {
    if (seen.has(chunk.notePath)) continue;
    seen.add(chunk.notePath);

    const note = store.getNote(vaultName, chunk.notePath);
    results.push({
      notePath: chunk.notePath,
      title: note?.title || chunk.notePath,
      heading: chunk.heading,
      snippet: chunk.content.slice(0, 300),
      score: similarity,
      matchType: "semantic",
    });
  }
  return results;
}

// ── Hybrid search ─────────────────────────────────────────────────────

const KEYWORD_WEIGHT = 0.4;
const SEMANTIC_WEIGHT = 0.6;

export async function hybridSearch(
  store: Store,
  vaultName: string,
  query: string,
  embedder: Embedder | null,
  limit = 20,
): Promise<SearchResult[]> {
  const keywordResults = keywordSearch(store, vaultName, query, limit * 2);

  // Fast-path: no embeddings available — keyword-only (avoids model load)
  const status = store.getIndexStatus(vaultName);
  if (!embedder || status.embeddedChunks === 0) {
    return keywordResults.slice(0, limit).map((r) => ({ ...r, matchType: "hybrid" as const }));
  }

  const semanticResults = await semanticSearch(store, vaultName, query, embedder, limit * 2);

  // Merge scores
  const merged = new Map<string, SearchResult>();

  for (const r of keywordResults) {
    merged.set(r.notePath, { ...r, score: r.score * KEYWORD_WEIGHT, matchType: "hybrid" });
  }
  for (const r of semanticResults) {
    const existing = merged.get(r.notePath);
    if (existing) {
      existing.score += r.score * SEMANTIC_WEIGHT;
      existing.snippet = existing.snippet || r.snippet;
    } else {
      merged.set(r.notePath, { ...r, score: r.score * SEMANTIC_WEIGHT, matchType: "hybrid" });
    }
  }

  // Sort and return top
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── Embedding ─────────────────────────────────────────────────────────

// ── Embedding pipeline (background) ────────────────────────────────────

export async function embedChunks(
  store: Store,
  vaultName: string,
  embedder: Embedder,
  batchSize = 32,
): Promise<number> {
  const unembedded = store.getUnembeddedChunks(vaultName, batchSize);
  if (unembedded.length === 0) return 0;

  const texts = unembedded.map((c) => `${c.heading}\n\n${c.content}`);
  const embeddings = await embedder.embedBatch(texts);

  for (let i = 0; i < unembedded.length; i++) {
    store.setEmbedding(unembedded[i].id, embeddings[i]);
  }
  return unembedded.length;
}

/** Embed all unembedded chunks in a loop with progress reporting. Designed for background use. */
export async function embedAllChunks(
  store: Store,
  vaultName: string,
  embedder: Embedder,
  batchSize = 32,
): Promise<void> {
  let batchCount: number;
  do {
    batchCount = await embedChunks(store, vaultName, embedder, batchSize);
    // Update progress in index_meta so index_status shows real-time progress
    const status = store.getIndexStatus(vaultName);
    store.setIndexMeta(vaultName, { embeddedChunks: status.embeddedChunks });
  } while (batchCount > 0);
}

// ── Cosine similarity ─────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[] | Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding dimension mismatch: query has ${a.length} dims but stored embedding has ${b.length} dims. ` +
        `The embedding model may have changed. Run reindex with embed:true to regenerate all embeddings.`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Helpers ───────────────────────────────────────────────────────────

function stripMarks(snippet: string): string {
  return snippet.replace(/<\/?mark>/g, "");
}
