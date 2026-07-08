import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type { DodDocument } from "./types.js";

function getStoreDir(): string {
  return process.env.DOD_STORE_DIR || path.join(os.homedir(), ".claude", "dod-store");
}

async function ensureStoreDir(): Promise<void> {
  await fs.mkdir(getStoreDir(), { recursive: true });
}

function docPath(id: string): string {
  return path.join(getStoreDir(), `${id}.json`);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export async function save(doc: DodDocument): Promise<void> {
  await ensureStoreDir();
  await fs.writeFile(docPath(doc.id), JSON.stringify(doc, null, 2), "utf-8");
}

export async function load(id: string): Promise<DodDocument | null> {
  try {
    const data = await fs.readFile(docPath(id), "utf-8");
    return JSON.parse(data) as DodDocument;
  } catch (err: unknown) {
    if (process.env.DOD_STORE_DIR) console.error("store: failed to load document", { id, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function findByPath(markdownPath: string): Promise<DodDocument | null> {
  await ensureStoreDir();
  const files = await fs.readdir(getStoreDir());
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = await fs.readFile(path.join(getStoreDir(), file), "utf-8");
      const doc = JSON.parse(data) as DodDocument;
      const normalizedStored = path.resolve(doc.markdown_path).toLowerCase();
      const normalizedSearch = path.resolve(markdownPath).toLowerCase();
      if (normalizedStored === normalizedSearch) return doc;
    } catch (err: unknown) {
      if (process.env.DOD_STORE_DIR) console.error("store: failed to read file during findByPath", { file, err: err instanceof Error ? err.message : String(err) });
      continue;
    }
  }
  return null;
}

export async function listAll(): Promise<DodDocument[]> {
  await ensureStoreDir();
  const files = await fs.readdir(getStoreDir());
  const docs: DodDocument[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = await fs.readFile(path.join(getStoreDir(), file), "utf-8");
      docs.push(JSON.parse(data) as DodDocument);
    } catch (err: unknown) {
      if (process.env.DOD_STORE_DIR) console.error("store: failed to read file during listAll", { file, err: err instanceof Error ? err.message : String(err) });
      continue;
    }
  }
  return docs;
}

export async function remove(id: string): Promise<boolean> {
  try {
    await fs.unlink(docPath(id));
    return true;
  } catch (err: unknown) {
    if (process.env.DOD_STORE_DIR) console.error("store: failed to remove document", { id, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
