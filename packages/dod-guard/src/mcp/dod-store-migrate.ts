/**
 * dod_store_migrate adapter: converts legacy 'steps' documents to the
 * 'roots' TaskNode tree format. One legacy-format test, reused for the
 * single-document path and the bulk path.
 */
import { writeMarkdown } from "../author.js";
import * as store from "../store.js";
import type { DodDocument } from "../types.js";
import { isLegacyFormat, type RawDoc } from "./resolve.js";

interface MigrateParams {
  dod_id?: string;
  dry_run?: boolean;
}

export async function handleDodStoreMigrate(params: MigrateParams): Promise<string> {
  const dryRun = params.dry_run ?? false;
  if (params.dod_id) return migrateOne(params.dod_id, dryRun);
  return migrateBulk(dryRun);
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

async function migrateOne(dodId: string, dryRun: boolean): Promise<string> {
  const raw = await store.loadRaw(dodId);
  if (!raw) return `ERROR: DoD "${dodId}" not found.`;
  if (isLegacyFormat(raw)) return migrateRawDoc(raw, dryRun);
  if (!(hasNonEmptyArray(raw.steps) || hasNonEmptyArray(raw.roots))) {
    return `"${raw.title}" has no steps or roots — cannot migrate.`;
  }
  return `"${raw.title}" is already in the current format — no migration needed.`;
}

async function migrateBulk(dryRun: boolean): Promise<string> {
  const docs = await store.listAllRaw();
  const legacy = docs.filter(isLegacyFormat);
  if (legacy.length === 0) {
    return "No legacy documents found — all docs are in the current format.";
  }
  const lines: string[] = [];
  for (const raw of legacy) lines.push(await migrateRawDoc(raw, dryRun));
  return lines.join("\n");
}

function countLegacyProofs(raw: RawDoc): number {
  if (!Array.isArray(raw.steps)) return 0;
  return raw.steps.reduce(
    (sum: number, step: RawDoc) => sum + (Array.isArray(step.proofs) ? step.proofs.length : 0),
    0,
  );
}

async function migrateRawDoc(raw: RawDoc, dryRun: boolean): Promise<string> {
  const rootCount = Array.isArray(raw.steps) ? raw.steps.length : 0;
  if (dryRun) {
    const proofCount = countLegacyProofs(raw);
    return `Would migrate: "${raw.title}" → ${rootCount} root task group(s), ${proofCount} proof(s).`;
  }

  const migrated = await store.migrateDoc(raw as Parameters<typeof store.migrateDoc>[0]);
  if (!migrated) {
    return `"${raw.title}" is already in the current format — no migration needed.`;
  }
  const doc = raw as DodDocument;
  await writeMarkdown(doc);
  return `Migrated: "${doc.title}" → ${doc.roots.length} root task group(s).`;
}
