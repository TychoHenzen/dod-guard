/**
 * dod_list adapter: enumerate all tracked documents.
 */
import { countDraftNodes } from "../checker.js";
import { flattenConcreteLeaves } from "../fingerprint.js";
import * as store from "../store.js";
import type { DodDocument } from "../types.js";
import { isLegacyFormat, type RawDoc } from "./resolve.js";

function formatLegacyBlock(raw: RawDoc): string {
  const n = Array.isArray(raw.steps) ? raw.steps.length : 0;
  const status = `${n} step(s) in old format.`;
  const hint = "Run dod_store_migrate to upgrade.";
  return [raw.title, `ID: ${raw.id}`, `Status: LEGACY | ${status} ${hint}`].join(
    "\n",
  );
}

function formatDocBlock(doc: DodDocument): string {
  const concrete = flattenConcreteLeaves(doc.roots).length;
  const draft = countDraftNodes(doc.roots);
  const draftClause = draft > 0 ? ` (${draft} draft)` : "";
  const proofs = `${concrete} concrete proofs${draftClause}`;
  const counts = `${doc.roots.length} roots, ${proofs}`;
  const status = `Status: UNCHECKED | ${counts}`;
  return [doc.title, `ID: ${doc.id}`, status].join("\n");
}

function formatBlock(raw: RawDoc): string {
  if (isLegacyFormat(raw)) return formatLegacyBlock(raw);
  return formatDocBlock(raw as DodDocument);
}

export async function handleDodList(): Promise<string> {
  const docs = await store.listAllRaw();
  if (docs.length === 0) {
    return "No DoD documents tracked. Use dod_create or dod_import to add one.";
  }

  return docs.map(formatBlock).join("\n\n");
}
