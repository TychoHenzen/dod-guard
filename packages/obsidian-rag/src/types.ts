// Types for obsidian-rag MCP server

export interface VaultInfo {
  name: string;
  path: string;
  noteCount?: number;
  folderCount?: number;
  size?: string;
}

export interface NoteMeta {
  path: string;        // relative to vault root
  title: string;       // from first H1 or filename
  tags: string[];      // from frontmatter + inline #tags
  links: string[];     // [[wikilinks]] targets
  backlinks: string[]; // notes that link here (populated at query time)
  created: string;     // from frontmatter or fs stat
  modified: string;    // from frontmatter or fs stat
  frontmatter: Record<string, unknown>;
}

export interface NoteContent extends NoteMeta {
  content: string;     // raw markdown body (frontmatter stripped)
  raw: string;         // full file contents
}

export interface Chunk {
  id: string;          // `${notePath}#${chunkIndex}`
  notePath: string;
  heading: string;     // nearest heading breadcrumb
  content: string;     // chunk text (plaintext, ~512 chars)
  embedding?: number[];// cached embedding vector
}

export interface SearchResult {
  notePath: string;
  title: string;
  heading: string;
  snippet: string;     // relevant excerpt
  score: number;       // 0-1 relevance
  matchType: "keyword" | "semantic" | "hybrid";
}

export interface MemoryEntry {
  id: string;          // filename without .md
  path: string;        // relative to vault/Claude-Memories/
  title: string;
  description: string;
  type: string;        // user | feedback | project | reference
  content: string;
  metadata: Record<string, unknown>;
  created: string;
  modified: string;
}

export interface IndexStatus {
  vault: VaultInfo | null;
  totalNotes: number;
  indexedNotes: number;
  totalChunks: number;
  embeddedChunks: number;
  lastIndexed: string | null;
  indexing: boolean;
}

export interface ToolCallContext {
  vaultPath: string | null;
  dbPath: string | null;
  selectedVault: VaultInfo | null;
}
