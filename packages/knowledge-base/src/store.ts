import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  type EntrySummary,
  type IndexedEntry,
  isStableKey,
  KNOWLEDGE_INDEX_VERSION,
  KnowledgeBaseError,
  type KnowledgeEntry,
  type KnowledgeIndex,
  parseKnowledgeDocument,
  validateUniqueEntries,
} from "./schema.js";

const ENTRIES_DIR = "entries";
const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[#+.-][\p{L}\p{N}]*)*/gu;

export interface ChapterSummary {
  key: string;
  entryCount: number;
}

export interface SectionSummary {
  key: string;
  chapter: string;
  entryCount: number;
}

async function markdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

function summary(entry: KnowledgeEntry): EntrySummary {
  if (!entry.path) throw new KnowledgeBaseError(`entry ${entry.key} has no stored path`);
  return {
    key: entry.key,
    title: entry.title,
    chapter: entry.chapter,
    section: entry.section,
    summary: entry.summary,
    sources: entry.sources,
    project: entry.project,
    language: entry.language,
    path: entry.path,
  };
}

function searchText(entry: KnowledgeEntry): string {
  return [
    entry.key,
    entry.title,
    entry.chapter,
    entry.section,
    entry.summary,
    entry.content,
    entry.project,
    entry.language,
    ...entry.relatedKeys,
    ...entry.sources.flatMap((source) => [source.label, source.project, source.language]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

function indexed(entry: KnowledgeEntry): IndexedEntry {
  return { ...summary(entry), searchText: searchText(entry) };
}

function indexedSummary(entry: IndexedEntry): EntrySummary {
  return {
    key: entry.key,
    title: entry.title,
    chapter: entry.chapter,
    section: entry.section,
    summary: entry.summary,
    sources: entry.sources,
    project: entry.project,
    language: entry.language,
    path: entry.path,
  };
}

function summaryWithScore(entry: IndexedEntry & { score: number }): EntrySummary & { score: number } {
  return { ...indexedSummary(entry), score: entry.score };
}

function tokens(value: string): string[] {
  return value.toLocaleLowerCase().match(TOKEN_PATTERN) ?? [];
}

function scopeKey(value: string, field: string): void {
  if (!isStableKey(value)) throw new KnowledgeBaseError(`${field} is not a stable hierarchy key`);
}

export class KnowledgeBase {
  readonly rootDir: string;
  private readonly entriesDir: string;
  private readonly now: () => string;

  constructor(rootDir: string, now: () => string = () => new Date().toISOString()) {
    this.rootDir = resolve(rootDir);
    this.entriesDir = join(this.rootDir, ENTRIES_DIR);
    this.now = now;
  }

  private async buildIndex(): Promise<KnowledgeIndex> {
    const files = await markdownFiles(this.entriesDir);
    const entries: KnowledgeEntry[] = [];
    for (const file of files.sort()) {
      const location = relative(this.rootDir, file).replace(/\\/gu, "/");
      try {
        entries.push(parseKnowledgeDocument(await readFile(file, "utf8"), location));
      } catch (error) {
        if (error instanceof KnowledgeBaseError) {
          throw new KnowledgeBaseError(`Invalid knowledge document ${location}: ${error.message}`);
        }
        throw new KnowledgeBaseError(`Invalid knowledge document ${location}: ${String(error)}`);
      }
    }
    validateUniqueEntries(entries);
    const index: KnowledgeIndex = {
      version: KNOWLEDGE_INDEX_VERSION,
      generatedAt: this.now(),
      entries: entries.map(indexed),
    };
    // ponytail: rebuild is O(N) per request; add file watching and incremental indexing when the corpus needs it.
    return index;
  }

  async chapters(): Promise<ChapterSummary[]> {
    const index = await this.buildIndex();
    const counts = new Map<string, number>();
    for (const entry of index.entries) counts.set(entry.chapter, (counts.get(entry.chapter) ?? 0) + 1);
    return [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryCount]) => ({ key, entryCount }));
  }

  async sections(chapter: string): Promise<SectionSummary[]> {
    scopeKey(chapter, "chapter");
    const index = await this.buildIndex();
    const counts = new Map<string, number>();
    for (const entry of index.entries) {
      if (entry.chapter === chapter) counts.set(entry.section, (counts.get(entry.section) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryCount]) => ({ key, chapter, entryCount }));
  }

  async entries(chapter: string, section: string): Promise<EntrySummary[]> {
    scopeKey(chapter, "chapter");
    scopeKey(section, "section");
    const index = await this.buildIndex();
    return index.entries.filter((entry) => entry.chapter === chapter && entry.section === section).map(indexedSummary);
  }

  async search(query: string, limit = 10): Promise<Array<EntrySummary & { score: number }>> {
    const terms = tokens(query);
    if (terms.length === 0) return [];
    const index = await this.buildIndex();
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return index.entries
      .map((entry) => {
        const matched = terms.filter((term) => entry.searchText.includes(term)).length;
        const score = Math.min(1, matched / terms.length + (entry.key.includes(normalizedQuery) ? 0.25 : 0));
        return { ...entry, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
      .slice(0, limit)
      .map(summaryWithScore);
  }

  async get(key: string): Promise<KnowledgeEntry> {
    scopeKey(key, "key");
    const index = await this.buildIndex();
    const found = index.entries.find((entry) => entry.key === key);
    if (!found) throw new KnowledgeBaseError(`knowledge entry not found: ${key}`);
    const raw = await readFile(join(this.rootDir, found.path), "utf8");
    const entry = parseKnowledgeDocument(raw, found.path);
    if (entry.key !== key) throw new KnowledgeBaseError(`knowledge entry path changed for ${key}`);
    return entry;
  }

  async related(key: string): Promise<EntrySummary[]> {
    const entry = await this.get(key);
    const index = await this.buildIndex();
    return entry.relatedKeys.map((relatedKey) => {
      const found = index.entries.find((candidate) => candidate.key === relatedKey);
      if (!found) throw new KnowledgeBaseError(`${key}: related key ${relatedKey} does not exist`);
      return indexedSummary(found);
    });
  }
}
