import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type { DodDocument, TaskNode } from "./types.js";

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
    console.error("store: failed to load document", { id, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Like load() but returns the raw parsed JSON without type narrowing — preserves legacy fields like `steps`. */
export async function loadRaw(id: string): Promise<Record<string, any> | null> {
  try {
    const data = await fs.readFile(docPath(id), "utf-8");
    return JSON.parse(data);
  } catch (err: unknown) {
    console.error("store: failed to loadRaw document", { id, err: err instanceof Error ? err.message : String(err) });
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
      console.error("store: failed to read file during findByPath", {
        file,
        err: err instanceof Error ? err.message : String(err),
      });
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
      console.error("store: failed to read file during listAll", {
        file,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return docs;
}

// ── Legacy migration: steps format → roots format ──────────────────

interface LegacyProof {
  id: string;
  title?: string;
  command: string;
  predicate: { type: string; value?: number | string };
  description?: string;
  category?: string;
  advisory?: boolean;
  last_status?: string;
  last_output?: string;
  last_checked?: string;
}

interface LegacyStep {
  id: string;
  title: string;
  proofs: LegacyProof[];
}

function legacyStepToTaskNode(step: LegacyStep): TaskNode {
  const children: TaskNode[] = step.proofs.map((p) => ({
    id: p.id,
    title: p.title ?? p.description ?? step.title,
    refinement: "concrete" as const,
    command: p.command,
    predicate: p.predicate as import("./types.js").Predicate,
    description: p.description ?? "",
    category: p.category as import("./types.js").ProofCategory | undefined,
    advisory: p.advisory,
    last_status: (p.last_status as import("./types.js").ProofStatus) ?? "pending",
    last_output: p.last_output,
    last_checked: p.last_checked,
  }));

  return {
    id: step.id,
    title: step.title,
    refinement: "concrete" as const,
    last_status: children.length > 0 ? "pending" : "draft",
    children,
  };
}

export async function migrateDoc(doc: DodDocument & { steps?: LegacyStep[]; locked?: boolean }): Promise<boolean> {
  // Already migrated
  if (doc.roots && Array.isArray(doc.roots) && doc.roots.length > 0) return false;

  const legacySteps = (doc as any).steps;
  if (!legacySteps || !Array.isArray(legacySteps) || legacySteps.length === 0) {
    return false; // Nothing to migrate
  }

  // Convert legacy steps → TaskNode tree
  doc.roots = legacySteps.map(legacyStepToTaskNode);

  // Remove legacy fields
  delete (doc as any).steps;
  delete (doc as any).locked;

  // Compute fingerprint from new roots inline (avoids circular dependency on checker.js)
  const leafLines: string[] = [];
  function walk(nodes: TaskNode[]) {
    for (const n of nodes) {
      if (n.children) walk(n.children);
      else if (n.refinement === "concrete" && n.command) {
        leafLines.push(`${n.command}|${n.predicate?.type ?? ""}|${n.predicate?.value ?? ""}|${n.advisory ?? false}`);
      }
    }
  }
  walk(doc.roots);
  if (leafLines.length > 0) {
    const hash = crypto.createHash("sha256");
    for (const line of leafLines.sort()) hash.update(line);
    doc.proof_fingerprint = hash.digest("hex");
  }

  await save(doc);
  return true;
}

export async function listLegacyCount(): Promise<number> {
  const docs = await listAllRaw();
  return docs.filter((d: any) => d.steps && !d.roots).length;
}

/** listAllRaw returns all docs without type assertion — useful for migration checks */
export async function listAllRaw(): Promise<Record<string, any>[]> {
  await ensureStoreDir();
  const files = await fs.readdir(getStoreDir());
  const docs: Record<string, any>[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = await fs.readFile(path.join(getStoreDir(), file), "utf-8");
      docs.push(JSON.parse(data));
    } catch (err: unknown) {
      console.error("store: failed to read file during listAllRaw", {
        file,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return docs;
}

export async function remove(id: string): Promise<boolean> {
  try {
    await fs.unlink(docPath(id));
    return true;
  } catch (err: unknown) {
    console.error("store: failed to remove document", { id, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
