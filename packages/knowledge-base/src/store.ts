import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
  type SourceReference,
  serializeKnowledgeDocument,
  validateKnowledgeEntry,
  validateUniqueEntries,
} from "./schema.js";

const ENTRIES_DIR = "entries";
const INDEX_FILE = ".knowledge-index.json";
const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[#+.-][\p{L}\p{N}]*)*/gu;

export interface SaveKnowledgeEntryInput {
  key: string;
  title?: string;
  chapter?: string;
  section?: string;
  summary?: string;
  content?: string;
  sources?: SourceReference[];
  relatedKeys?: string[];
  project?: string;
  language?: string;
  reason?: string;
}

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

function snapshot(entry: KnowledgeEntry, at: string, reason: string) {
  return {
    at,
    reason,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    sources: entry.sources.map((source) => ({ ...source })),
    relatedKeys: [...entry.relatedKeys],
    project: entry.project,
    language: entry.language,
  };
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
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

  async rebuildIndex(): Promise<KnowledgeIndex> {
    await mkdir(this.entriesDir, { recursive: true });
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
    await atomicWrite(join(this.rootDir, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
    return index;
  }

  async chapters(): Promise<ChapterSummary[]> {
    const index = await this.rebuildIndex();
    const counts = new Map<string, number>();
    for (const entry of index.entries) counts.set(entry.chapter, (counts.get(entry.chapter) ?? 0) + 1);
    return [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryCount]) => ({ key, entryCount }));
  }

  async sections(chapter: string): Promise<SectionSummary[]> {
    scopeKey(chapter, "chapter");
    const index = await this.rebuildIndex();
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
    const index = await this.rebuildIndex();
    return index.entries.filter((entry) => entry.chapter === chapter && entry.section === section).map(indexedSummary);
  }

  async search(query: string, limit = 10): Promise<Array<EntrySummary & { score: number }>> {
    const terms = tokens(query);
    if (terms.length === 0) return [];
    const index = await this.rebuildIndex();
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
    const index = await this.rebuildIndex();
    const found = index.entries.find((entry) => entry.key === key);
    if (!found) throw new KnowledgeBaseError(`knowledge entry not found: ${key}`);
    const raw = await readFile(join(this.rootDir, found.path), "utf8");
    const entry = parseKnowledgeDocument(raw, found.path);
    if (entry.key !== key) throw new KnowledgeBaseError(`knowledge entry path changed for ${key}`);
    return entry;
  }

  async related(key: string): Promise<EntrySummary[]> {
    const entry = await this.get(key);
    const index = await this.rebuildIndex();
    return entry.relatedKeys.map((relatedKey) => {
      const found = index.entries.find((candidate) => candidate.key === relatedKey);
      if (!found) throw new KnowledgeBaseError(`${key}: related key ${relatedKey} does not exist`);
      return indexedSummary(found);
    });
  }

  async save(input: SaveKnowledgeEntryInput): Promise<KnowledgeEntry> {
    scopeKey(input.key, "key");
    await mkdir(this.entriesDir, { recursive: true });
    const files = await markdownFiles(this.entriesDir);
    const documents = await Promise.all(
      files.sort().map(async (file) => {
        const path = relative(this.rootDir, file).replace(/\\/gu, "/");
        return parseKnowledgeDocument(await readFile(file, "utf8"), path);
      }),
    );
    validateUniqueEntries(documents);
    const existing = documents.find((entry) => entry.key === input.key);
    const targetRelative = `entries/${input.key}.md`;
    const targetEntry = documents.find((entry) => entry.path === targetRelative);
    if (targetEntry && targetEntry.key !== input.key) {
      throw new KnowledgeBaseError(`${targetRelative}: path already stores ${targetEntry.key}`);
    }
    const at = this.now();
    const entry: KnowledgeEntry = {
      key: input.key,
      title: input.title ?? existing?.title ?? "",
      chapter: input.chapter ?? existing?.chapter ?? "",
      section: input.section ?? existing?.section ?? "",
      summary: input.summary ?? existing?.summary ?? "",
      content: input.content ?? existing?.content ?? "",
      sources: input.sources ?? existing?.sources ?? [],
      relatedKeys: input.relatedKeys ?? existing?.relatedKeys ?? [],
      history: existing ? [...existing.history, snapshot(existing, at, input.reason ?? "refined entry")] : [],
      project: input.project ?? existing?.project,
      language: input.language ?? existing?.language,
      path: targetRelative,
    };
    validateKnowledgeEntry(entry);
    validateUniqueEntries([...documents.filter((candidate) => candidate !== existing), entry]);
    const path = join(this.entriesDir, `${input.key}.md`);
    await atomicWrite(path, serializeKnowledgeDocument(entry));
    if (existing?.path && existing.path !== targetRelative) await unlink(join(this.rootDir, existing.path));
    await this.rebuildIndex();
    return entry;
  }
}
