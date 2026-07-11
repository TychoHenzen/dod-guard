// Markdown chunking and embedding pipeline

import { createHash } from "node:crypto";
import type { Chunk, NoteMeta } from "./types.js";
import { Store } from "./store.js";
import { readNote, walkVault } from "./vault.js";

const MAX_CHUNK_CHARS = 800;
const CHUNK_OVERLAP_CHARS = 100;

// ── Chunking ──────────────────────────────────────────────────────────

export function chunkMarkdown(notePath: string, content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = splitByHeadings(content);

  let currentChunk = "";
  let currentHeading = "";
  let chunkIndex = 0;

  for (const section of sections) {
    const { heading, text } = section;
    const displayHeading = heading || currentHeading;

    if (currentChunk.length + text.length > MAX_CHUNK_CHARS && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        id: `${notePath}#${chunkIndex}`,
        notePath,
        heading: currentHeading,
        content: currentChunk.trim(),
      });
      chunkIndex++;
      // Overlap: keep last bit of previous chunk
      const overlap = currentChunk.slice(-CHUNK_OVERLAP_CHARS);
      currentChunk = overlap + "\n\n" + text;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + text;
    }
    currentHeading = displayHeading;
  }

  // Final chunk
  if (currentChunk.trim()) {
    chunks.push({
      id: `${notePath}#${chunkIndex}`,
      notePath,
      heading: currentHeading,
      content: currentChunk.trim(),
    });
  }

  // If note is short, still create one chunk
  if (chunks.length === 0) {
    chunks.push({
      id: `${notePath}#0`,
      notePath,
      heading: "",
      content: content.slice(0, MAX_CHUNK_CHARS),
    });
  }

  return chunks;
}

interface Section {
  heading: string;
  text: string;
}

function splitByHeadings(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentText = "";
  let inCodeBlock = false;

  for (const line of lines) {
    // Toggle code blocks
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentText += line + "\n";
      continue;
    }

    // Heading outside code block
    if (!inCodeBlock && /^#{1,6}\s/.test(line)) {
      if (currentText.trim()) {
        sections.push({ heading: currentHeading, text: currentText.trim() });
      }
      currentHeading = line.replace(/^#+\s*/, "").trim();
      currentText = "";
    } else {
      currentText += line + "\n";
    }
  }

  if (currentText.trim()) {
    sections.push({ heading: currentHeading, text: currentText.trim() });
  }

  return sections;
}

// ── Content hashing ───────────────────────────────────────────────────

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// ── Indexing pipeline ─────────────────────────────────────────────────

export async function indexVault(vaultPath: string, vaultName: string, store: Store): Promise<number> {
  const files = await walkVault(vaultPath);
  store.setIndexMeta(vaultName, { totalNotes: files.length, indexing: true });

  let indexed = 0;
  let totalChunks = 0;

  for (const file of files) {
    try {
      const note = await readNote(vaultPath, file);
      const contentHash = hashContent(note.content);

      // Check if already indexed with same hash
      const existing = store.getNote(vaultName, file);
      if (existing && hashContent(existing.content) === contentHash) {
        indexed++;
        continue;
      }

      // Store note metadata + content in FTS
      store.upsertNote(vaultName, note, note.content, contentHash);

      // Chunk and store
      const chunks = chunkMarkdown(file, note.content);
      for (const chunk of chunks) {
        store.upsertChunk(chunk, vaultName);
      }
      totalChunks += chunks.length;
      indexed++;
    } catch (err) {
      console.error("obsidian-rag: index error", { file: String(file), err: err instanceof Error ? err.message : String(err) });
      continue;
    }
  }

  store.setIndexMeta(vaultName, {
    indexedNotes: indexed,
    totalNotes: files.length,
    lastIndexed: new Date().toISOString(),
    indexing: false,
  });
  // Only overwrite totalChunks if we created new ones
  if (totalChunks > 0) {
    store.setIndexMeta(vaultName, { totalChunks });
  }

  return indexed;
}

// ── Full reindex ──────────────────────────────────────────────────────

export async function reindexVault(vaultPath: string, vaultName: string, store: Store): Promise<number> {
  store.clearChunks(vaultName);
  store.clearNotes(vaultName);
  return indexVault(vaultPath, vaultName, store);
}
