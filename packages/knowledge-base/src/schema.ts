import { parse as parseYaml } from "yaml";

export const KNOWLEDGE_INDEX_VERSION = 1 as const;

const KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

export class KnowledgeBaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeBaseError";
  }
}

export interface SourceReference {
  label: string;
  url?: string;
  project?: string;
  language?: string;
}

export interface KnowledgeEntry {
  key: string;
  title: string;
  chapter: string;
  section: string;
  summary: string;
  content: string;
  sources: SourceReference[];
  relatedKeys: string[];
  project?: string;
  language?: string;
  path?: string;
}

export interface EntrySummary {
  key: string;
  title: string;
  chapter: string;
  section: string;
  summary: string;
  sources: SourceReference[];
  project?: string;
  language?: string;
  path: string;
}

export interface IndexedEntry extends EntrySummary {
  searchText: string;
}

export interface KnowledgeIndex {
  version: typeof KNOWLEDGE_INDEX_VERSION;
  generatedAt: string;
  entries: IndexedEntry[];
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KnowledgeBaseError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new KnowledgeBaseError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return;
  return requiredText(value, field);
}

function textList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new KnowledgeBaseError(`${field} must be an array`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function sources(value: unknown, field: string, allowEmpty: boolean): SourceReference[] {
  if (value === undefined) {
    if (allowEmpty) return [];
    throw new KnowledgeBaseError(`${field} must contain at least one source`);
  }
  if (!Array.isArray(value)) throw new KnowledgeBaseError(`${field} must be an array`);
  const parsed = value.map((item, index) => {
    const source = record(item, `${field}[${index}]`);
    return {
      label: requiredText(source.label, `${field}[${index}].label`),
      url: optionalText(source.url, `${field}[${index}].url`),
      project: optionalText(source.project, `${field}[${index}].project`),
      language: optionalText(source.language, `${field}[${index}].language`),
    };
  });
  if (!allowEmpty && parsed.length === 0) {
    throw new KnowledgeBaseError(`${field} must contain at least one source`);
  }
  return parsed;
}

export function isStableKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

function validateKnowledgeEntry(entry: KnowledgeEntry, location = entry.path ?? entry.key): void {
  for (const [field, value] of [
    ["key", entry.key],
    ["chapter", entry.chapter],
    ["section", entry.section],
  ] as const) {
    if (!isStableKey(value)) throw new KnowledgeBaseError(`${location}: ${field} is not a stable hierarchy key`);
  }
  if (entry.key !== entry.chapter && !entry.key.startsWith(`${entry.chapter}.`)) {
    throw new KnowledgeBaseError(`${location}: key must belong to chapter ${entry.chapter}`);
  }
  if (entry.section !== entry.chapter && !entry.section.startsWith(`${entry.chapter}.`)) {
    throw new KnowledgeBaseError(`${location}: section must belong to chapter ${entry.chapter}`);
  }
  requiredText(entry.title, `${location}.title`);
  requiredText(entry.summary, `${location}.summary`);
  requiredText(entry.content, `${location}.content`);
  sources(entry.sources, `${location}.sources`, false);
  const related = new Set(entry.relatedKeys);
  if (related.size !== entry.relatedKeys.length) {
    throw new KnowledgeBaseError(`${location}: related_keys contains duplicates`);
  }
  for (const relatedKey of entry.relatedKeys) {
    if (!isStableKey(relatedKey)) {
      throw new KnowledgeBaseError(`${location}: related key ${relatedKey} is not stable`);
    }
  }
}

export function validateUniqueEntries(entries: KnowledgeEntry[]): void {
  const keys = new Set<string>();
  for (const entry of entries) {
    validateKnowledgeEntry(entry);
    if (keys.has(entry.key)) throw new KnowledgeBaseError(`duplicate hierarchy key ${entry.key}`);
    keys.add(entry.key);
  }
  for (const entry of entries) {
    for (const relatedKey of entry.relatedKeys) {
      if (!keys.has(relatedKey)) {
        throw new KnowledgeBaseError(`${entry.key}: related key ${relatedKey} does not exist`);
      }
    }
  }
}

function splitDocument(raw: string, location: string): { frontmatter: string; content: string } {
  const lines = raw.split(/\r?\n/u);
  if (lines[0] !== "---") throw new KnowledgeBaseError(`${location}: document must start with front matter`);
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end < 0) throw new KnowledgeBaseError(`${location}: front matter is not closed`);
  return {
    frontmatter: lines.slice(1, end).join("\n"),
    content: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\n/u, "")
      .trimEnd(),
  };
}

export function parseKnowledgeDocument(raw: string, location: string): KnowledgeEntry {
  const parts = splitDocument(raw, location);
  let data: Record<string, unknown>;
  try {
    data = record(parseYaml(parts.frontmatter), `${location} front matter`);
  } catch (error) {
    if (error instanceof KnowledgeBaseError) throw error;
    throw new KnowledgeBaseError(`${location}: invalid YAML front matter: ${String(error)}`);
  }
  const entry: KnowledgeEntry = {
    key: requiredText(data.key, `${location}.key`),
    title: requiredText(data.title, `${location}.title`),
    chapter: requiredText(data.chapter, `${location}.chapter`),
    section: requiredText(data.section, `${location}.section`),
    summary: requiredText(data.summary, `${location}.summary`),
    content: parts.content,
    sources: sources(data.sources, `${location}.sources`, false),
    relatedKeys: textList(data.related_keys, `${location}.related_keys`),
    project: optionalText(data.project, `${location}.project`),
    language: optionalText(data.language, `${location}.language`),
    path: location,
  };
  validateKnowledgeEntry(entry, location);
  return entry;
}
