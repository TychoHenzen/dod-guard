// Vault file operations.
// Interactive tool calls use Obsidian CLI as source of truth.
// Indexer (bulk) uses direct filesystem for performance — CLI would be too slow for 1000+ notes.

import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, relative, basename, dirname, extname } from "node:path";
import { existsSync } from "node:fs";
import matter from "gray-matter";
import type { NoteMeta, NoteContent, MemoryEntry } from "./types.js";
import { cliGetBacklinks, cliGetTags } from "./cli.js";

// ── File discovery (FS — bulk indexing perf) ─────────────────────────────

export async function walkVault(vaultPath: string): Promise<string[]> {
  const files: string[] = [];
  const dirs = [vaultPath];

  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const base = e.name;
        // Skip hidden dirs and Obsidian system dirs
        if (!base.startsWith(".")) {
          dirs.push(full);
        }
      } else if (e.isFile() && e.name.endsWith(".md")) {
        files.push(relative(vaultPath, full));
      }
    }
  }
  return files;
}

// ── Reading (FS — bulk indexing perf) ────────────────────────────────────

export async function readNote(vaultPath: string, notePath: string): Promise<NoteContent> {
  const fullPath = join(vaultPath, notePath);
  const raw = await readFile(fullPath, "utf-8");
  const { data: frontmatter, content } = matter(raw);
  const meta = extractMeta(notePath, frontmatter, content);
  return { ...meta, content, raw };
}

export async function readNoteMeta(vaultPath: string, notePath: string): Promise<NoteMeta> {
  const fullPath = join(vaultPath, notePath);
  const raw = await readFile(fullPath, "utf-8");
  const { data: frontmatter, content } = matter(raw);
  return extractMeta(notePath, frontmatter, content);
}

// ── Writing (FS — CLI create/append can't express full frontmatter) ──────

export async function writeNote(
  vaultPath: string,
  notePath: string,
  frontmatter: Record<string, unknown>,
  content: string
): Promise<void> {
  const fullPath = join(vaultPath, notePath);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const fm = Object.keys(frontmatter).length > 0 ? matter.stringify(content, frontmatter) : content;
  await writeFile(fullPath, fm, "utf-8");
}

export async function deleteNote(vaultPath: string, notePath: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  await unlink(join(vaultPath, notePath));
}

// ── Links (CLI) ──────────────────────────────────────────────────────────

export async function getBacklinks(
  vaultName: string,
  vaultPath: string,
  targetPath: string,
): Promise<string[]> {
  try {
    return await cliGetBacklinks(vaultName, targetPath);
  } catch {
    // CLI fallback: FS scan
    return fsBacklinks(vaultPath, targetPath);
  }
}

/** FS fallback for backlinks when CLI unavailable. */
async function fsBacklinks(vaultPath: string, targetPath: string): Promise<string[]> {
  const targetName = basename(targetPath, ".md");
  const allFiles = await walkVault(vaultPath);
  const backlinks: string[] = [];
  for (const file of allFiles) {
    if (file === targetPath) continue;
    const note = await readNote(vaultPath, file);
    const linkPattern = new RegExp(
      `\\[\\[${escapeRegex(targetName)}(?:\\|[^\\]]+)?\\]\\]`,
      "i"
    );
    if (linkPattern.test(note.content)) {
      backlinks.push(file);
    }
  }
  return backlinks;
}

export function extractLinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim());
  }
  return [...new Set(links)];
}

export function extractTags(content: string, frontmatterTags?: unknown): string[] {
  const tags = new Set<string>();
  if (Array.isArray(frontmatterTags)) {
    for (const t of frontmatterTags) tags.add(String(t).replace(/^#/, ""));
  } else if (typeof frontmatterTags === "string") {
    tags.add(frontmatterTags.replace(/^#/, ""));
  }
  const re = /(?:^|\s)#([a-zA-Z][\w/-]*)/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    tags.add(m[1]);
  }
  return [...tags];
}

// ── Tag aggregation (CLI + FS fallback) ──────────────────────────────────

export async function aggregateTags(
  vaultName: string,
  vaultPath: string,
): Promise<Map<string, number>> {
  try {
    return await cliGetTags(vaultName);
  } catch {
    // CLI fallback: FS scan
    const files = await walkVault(vaultPath);
    const tagCounts = new Map<string, number>();
    for (const file of files) {
      const meta = await readNoteMeta(vaultPath, file);
      for (const tag of meta.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return tagCounts;
  }
}

// ── Memory operations (FS — Claude-Memories format) ──────────────

export function memoryDir(vaultPath: string): string {
  return join(vaultPath, "Claude-Memories");
}

export async function readMemories(vaultPath: string): Promise<MemoryEntry[]> {
  const dir = memoryDir(vaultPath);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  const entries: MemoryEntry[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const fullPath = join(dir, file);
    const raw = await readFile(fullPath, "utf-8");
    const { data: fm, content } = matter(raw);
    entries.push({
      id: basename(file, ".md"),
      path: join("Claude-Memories", file),
      title: (fm as any).name || basename(file, ".md"),
      description: (fm as any).description || "",
      type: (fm as any).metadata?.type || "reference",
      content: content.trim(),
      metadata: (fm as any).metadata || {},
      created: (fm as any).created || "",
      modified: (fm as any).modified || "",
    });
  }
  return entries;
}

export async function writeMemory(
  vaultPath: string,
  entry: Omit<MemoryEntry, "path" | "modified" | "created"> & { created?: string }
): Promise<string> {
  const dir = memoryDir(vaultPath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const fileName = `${entry.id}.md`;
  const notePath = join("Claude-Memories", fileName);
  const frontmatter: Record<string, unknown> = {
    name: entry.title,
    description: entry.description,
    metadata: entry.metadata,
    created: entry.created || now,
    modified: now,
  };
  await writeNote(vaultPath, notePath, frontmatter, entry.content);
  return notePath;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function extractMeta(
  notePath: string,
  frontmatter: Record<string, unknown>,
  content: string
): NoteMeta {
  const fmTags = frontmatter.tags;
  const title =
    (frontmatter.title as string) ||
    extractFirstH1(content) ||
    basename(notePath, ".md");

  return {
    path: notePath,
    title,
    tags: extractTags(content, fmTags),
    links: extractLinks(content),
    backlinks: [],
    created: String(frontmatter.created || frontmatter.date || ""),
    modified: String(frontmatter.modified || frontmatter.updated || ""),
    frontmatter,
  };
}

function extractFirstH1(content: string): string | null {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
