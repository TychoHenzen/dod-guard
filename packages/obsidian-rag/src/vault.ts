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
  const fmStr = matter.stringify(content.trim(), frontmatter);
  await writeFile(fullPath, fmStr, "utf-8");
}

export async function deleteNote(vaultPath: string, notePath: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  await unlink(join(vaultPath, notePath));
}

// ── Wikilinks ────────────────────────────────────────────────────────────

export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)];
}

// ── Backlinks (FS scan) ──────────────────────────────────────────────────

export async function getBacklinks(vaultPath: string, targetPath: string): Promise<string[]> {
  const targetName = basename(targetPath, ".md");
  const allFiles = await walkVault(vaultPath);
  const backlinks: string[] = [];
  for (const file of allFiles) {
    if (file === targetPath) continue;
    const note = await readNote(vaultPath, file);
    if (note.content.includes(`[[${targetName}]]`)) {
      backlinks.push(file);
    }
  }
  return backlinks;
}

// ── Tags ─────────────────────────────────────────────────────────────────

export async function aggregateTags(
  vaultName: string,
  vaultPath: string
): Promise<Map<string, number>> {
  const allFiles = await walkVault(vaultPath);
  const tagCounts = new Map<string, number>();
  for (const file of allFiles) {
    try {
      const meta = await readNoteMeta(vaultPath, file);
      if (meta.tags) {
        for (const tag of meta.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    } catch {
      // skip broken files
    }
  }
  return tagCounts;
}

// ── Memory operations (FS — Claude-Memories format, type subfolders) ──

const MEMORY_DIR = "Claude-Memories";

export function memoryDir(vaultPath: string): string {
  return join(vaultPath, MEMORY_DIR);
}

/** Walk Claude-Memories/ recursively, reading all .md files. */
async function walkMemoryDir(baseDir: string): Promise<string[]> {
  const results: string[] = [];
  if (!existsSync(baseDir)) return results;

  const entries = await readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(baseDir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkMemoryDir(full);
      results.push(...sub);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

export async function readMemories(vaultPath: string): Promise<MemoryEntry[]> {
  const dir = memoryDir(vaultPath);
  const files = await walkMemoryDir(dir);
  const entries: MemoryEntry[] = [];
  for (const fullPath of files) {
    const raw = await readFile(fullPath, "utf-8");
    const { data: fm, content } = matter(raw);
    const relPath = relative(vaultPath, fullPath);
    entries.push({
      id: basename(fullPath, ".md"),
      path: relPath,
      title: (fm as any).name || basename(fullPath, ".md"),
      description: (fm as any).description || "",
      type: (fm as any).type || (fm as any).metadata?.type || "reference",
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
  const now = new Date().toISOString();
  const fileName = `${entry.id}.md`;
  // Write to type subfolder: Claude-Memories/<type>/<id>.md
  const typeDir = entry.type || "reference";
  const notePath = join(MEMORY_DIR, typeDir, fileName);
  const frontmatter: Record<string, unknown> = {
    name: entry.title,
    description: entry.description,
    type: entry.type || "reference",
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
  const tags = Array.isArray(fmTags)
    ? fmTags.map((t: unknown) => String(t).replace(/^#/, ""))
    : typeof fmTags === "string"
      ? fmTags.split(/,\s*/).map((t: string) => t.replace(/^#/, "")) : [];
  const links = extractWikilinks(content);
  return {
    path: notePath,
    title: (frontmatter.title as string) || basename(notePath, ".md"),
    tags,
    links,
    backlinks: [],
    frontmatter: frontmatter as Record<string, unknown>,
    created: (frontmatter.created as string) || "",
    modified: (frontmatter.modified as string) || "",
  };
}
