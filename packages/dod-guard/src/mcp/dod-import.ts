/**
 * dod_import adapter: parse a markdown DoD into canonical storage.
 */
import * as path from "node:path";
import { writeMarkdown } from "../author.js";
import { countDraftNodes } from "../checker.js";
import { computeProofFingerprint, flattenConcreteLeaves } from "../fingerprint.js";
import { parseMarkdown } from "../parser.js";
import * as store from "../store.js";
import { checkCommandsForOs } from "../tree-utils.js";
import type { DodDocument } from "../types.js";

interface ImportParams {
  path: string;
  cwd: string;
}

export async function handleDodImport(params: ImportParams): Promise<string> {
  const mdPath = path.resolve(params.path);
  const existing = await store.findByPath(mdPath);
  if (existing) {
    return `Already tracked as "${existing.title}" (ID: ${existing.id}).`;
  }

  const doc = await buildImportedDoc(params, mdPath);
  const osError = await checkCommandsForOs(doc.roots, doc.cwd);
  if (osError) return osError;

  await store.save(doc);
  await writeMarkdown(doc);

  const concrete = flattenConcreteLeaves(doc.roots).length;
  const draft = countDraftNodes(doc.roots);

  return ["DoD imported.", "", `ID: ${doc.id}`, `Concrete proofs: ${concrete}`, `Draft nodes: ${draft}`].join("\n");
}

async function buildImportedDoc(params: ImportParams, mdPath: string): Promise<DodDocument> {
  const parsed = await parseMarkdown(params.path);
  const fingerprint = computeProofFingerprint(parsed.roots);

  return {
    id: store.generateId(),
    title: parsed.title || path.basename(mdPath),
    goal: parsed.goal,
    date: parsed.date || new Date().toISOString().split("T")[0],
    cwd: parsed.cwd && parsed.cwd !== "." ? parsed.cwd : path.resolve(params.cwd),
    markdown_path: mdPath,
    created_at: new Date().toISOString(),
    import_source: mdPath,
    execution_confirmed: false,
    sections: parsed.sections,
    roots: parsed.roots,
    proof_fingerprint: fingerprint || undefined,
    amendments: [],
  };
}
