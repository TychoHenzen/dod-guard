import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("cosineSimilarity", () => {
  // Inline the function since it's not exported
  function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(
        `Embedding dimension mismatch: query has ${a.length} dims but stored embedding has ${b.length} dims.`
      );
    }
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  it("identical vectors have similarity 1", () => {
    const v = [1, 2, 3];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 0.001);
  });

  it("orthogonal vectors have similarity 0", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 0.001);
  });

  it("different lengths throws descriptive error", () => {
    assert.throws(
      () => cosineSimilarity([1, 2], [1, 2, 3]),
      /Embedding dimension mismatch/,
    );
  });

  it("opposite vectors have similarity -1", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 1], [-1, -1]) + 1) < 0.001);
  });
});

describe("semanticSearch fast-path", () => {
  it("returns empty when embeddedChunks is 0", async () => {
    const { semanticSearch } = await import("./retriever.js");
    let embedderCalled = false;
    const mockEmbedder = {
      embed: async (_t: string) => { embedderCalled = true; return []; },
      embedBatch: async (_t: string[]) => { embedderCalled = true; return []; },
    };
    const mockStore = {
      getIndexStatus: mock.fn((_vn: string) => ({ embeddedChunks: 0, totalChunks: 10, totalNotes: 5, indexedNotes: 5, lastIndexed: null, indexing: false, vault: null })),
      getChunksWithEmbeddings: mock.fn((_vn: string) => []),
      getNote: mock.fn((_vn: string, _p: string) => null),
    };
    const results = await semanticSearch(mockStore as any, "vault", "test", mockEmbedder, 10);
    assert.equal(results.length, 0);
    assert.equal(embedderCalled, false);
  });

  it("scores chunks via BLOB Float32Array embeddings", async () => {
    const { semanticSearch } = await import("./retriever.js");

    const queryEmbedding = [1, 0, 0, 0];
    const mockEmbedder = {
      embed: async (_t: string) => queryEmbedding,
      embedBatch: async (_t: string[]) => [],
    };

    const mockStore = {
      getIndexStatus: mock.fn((_vn: string) => ({ embeddedChunks: 2, totalChunks: 2, totalNotes: 2, indexedNotes: 2, lastIndexed: null, indexing: false, vault: null })),
      getChunksWithEmbeddings: mock.fn((_vn: string) => [
        { id: "a.md#0", notePath: "a.md", vaultName: "vault", heading: "H1", content: "Similar", embedding: null, embeddingVector: new Float32Array([0.9, 0.1, 0, 0]) },
        { id: "b.md#0", notePath: "b.md", vaultName: "vault", heading: "H2", content: "Different", embedding: null, embeddingVector: new Float32Array([0, 0, 0.9, 0.1]) },
      ]),
      getNote: mock.fn((_vn: string, p: string) => ({ path: p, title: p.replace(".md", ""), tags: [], links: [], backlinks: [], frontmatter: {}, created: "", modified: "", content: "" })),
    };

    const results = await semanticSearch(mockStore as any, "vault", "test", mockEmbedder, 10);
    assert.equal(results.length, 2);
    assert.equal(results[0].notePath, "a.md");
    assert.ok(results[0].score > results[1].score);
    // Verify score = cosine([1,0,0,0], [0.9,0.1,0,0]) = 0.9 / sqrt(1) / sqrt(0.82) ~ 0.994
    const expected = 0.9 / Math.sqrt(0.9 * 0.9 + 0.1 * 0.1);
    assert.ok(Math.abs(results[0].score - expected) < 0.001);
  });
});

describe("embedAllChunks", () => {
  it("embeds all unembedded chunks in a loop", async () => {
    const { embedAllChunks } = await import("./retriever.js");

    const batchResults = [2, 1, 0]; // 3 batches: 2 chunks, 1 chunk, done
    let batchIndex = 0;

    const mockEmbedder = {
      embed: async (_t: string) => [0.1, 0.2],
      embedBatch: async (_t: string[]) => _t.map(() => [0.1, 0.2]),
    };

    const statusCalls: any[] = [];
    const mockStore = {
      getUnembeddedChunks: mock.fn((_vn: string, _limit: number) => {
        const idx = batchIndex++;
        const remaining = batchResults[idx] || 0;
        const chunks: any[] = [];
        for (let i = 0; i < remaining; i++) {
          chunks.push({ id: `chunk-${i}`, notePath: "n.md", heading: "", content: "x" });
        }
        return chunks;
      }),
      setEmbedding: mock.fn((_id: string, _emb: number[]) => {}),
      getIndexStatus: mock.fn((_vn: string) => {
        const s = { embeddedChunks: 5 + batchIndex * 2, totalChunks: 10, vault: null, totalNotes: 5, indexedNotes: 5, lastIndexed: null, indexing: false };
        statusCalls.push(s);
        return s;
      }),
      setIndexMeta: mock.fn((_vn: string, data: any) => {}),
    };

    await embedAllChunks(mockStore as any, "vault", mockEmbedder, 2);

    // Should have called getUnembeddedChunks 3 times (2, 1, 0)
    assert.equal(mockStore.getUnembeddedChunks.mock.calls.length, 3);
    // Should have called setEmbedding for each chunk (2 + 1 = 3)
    assert.equal(mockStore.setEmbedding.mock.calls.length, 3);
    // Should have called getIndexStatus + setIndexMeta each batch (2 batches with data)
    assert.ok(mockStore.setIndexMeta.mock.calls.length >= 2);
  });

  it("returns immediately when no unembedded chunks exist", async () => {
    const { embedAllChunks } = await import("./retriever.js");

    const mockEmbedder = {
      embed: async (_t: string) => [0.1, 0.2],
      embedBatch: async (_t: string[]) => [],
    };

    const mockStore = {
      getUnembeddedChunks: mock.fn((_vn: string, _limit: number) => []),
      setEmbedding: mock.fn((_id: string, _emb: number[]) => {}),
      getIndexStatus: mock.fn((_vn: string) => ({ embeddedChunks: 0, totalChunks: 10, vault: null, totalNotes: 5, indexedNotes: 5, lastIndexed: null, indexing: false })),
      setIndexMeta: mock.fn((_vn: string, data: any) => {}),
    };

    await embedAllChunks(mockStore as any, "vault", mockEmbedder, 32);

    assert.equal(mockStore.getUnembeddedChunks.mock.calls.length, 1);
    assert.equal(mockStore.setEmbedding.mock.calls.length, 0);
  });
});

describe("hybridSearch fast-path", () => {
  it("returns keyword-only when embeddedChunks is 0 and embedder is provided", async () => {
    const { hybridSearch } = await import("./retriever.js");
    let embedderCalled = false;
    const mockEmbedder = {
      embed: async (_t: string) => { embedderCalled = true; return []; },
      embedBatch: async (_t: string[]) => { embedderCalled = true; return []; },
    };
    const mockStore = {
      getIndexStatus: mock.fn((_vn: string) => ({ embeddedChunks: 0, totalChunks: 10, totalNotes: 5, indexedNotes: 5, lastIndexed: null, indexing: false, vault: null })),
      searchNotesFTS: mock.fn((_vn: string, q: string, _limit: number) => [
        { path: "note.md", title: "Note", snippet: "some keyword match", score: 0.5 },
      ]),
      getNote: mock.fn((_vn: string, _p: string) => null),
      getChunks: mock.fn((_vn: string) => []),
    };
    const results = await hybridSearch(mockStore as any, "vault", "test", mockEmbedder, 10);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchType, "hybrid");
    assert.equal(results[0].notePath, "note.md");
    assert.equal(embedderCalled, false);
  });

  it("returns keyword-only when embedder is null regardless of embeddedChunks", async () => {
    const { hybridSearch } = await import("./retriever.js");
    const mockStore = {
      getIndexStatus: mock.fn((_vn: string) => ({ embeddedChunks: 50, totalChunks: 10, totalNotes: 5, indexedNotes: 5, lastIndexed: null, indexing: false, vault: null })),
      searchNotesFTS: mock.fn((_vn: string, q: string, _limit: number) => [
        { path: "note.md", title: "Note", snippet: "match", score: 0.5 },
      ]),
      getNote: mock.fn((_vn: string, _p: string) => null),
      getChunks: mock.fn((_vn: string) => []),
    };
    const results = await hybridSearch(mockStore as any, "vault", "test", null, 10);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchType, "hybrid");
  });
});
