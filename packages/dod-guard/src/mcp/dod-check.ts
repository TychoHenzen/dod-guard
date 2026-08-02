/**
 * dod_check adapter: resolves the doc, enforces the import gate and the
 * nodePath precondition, runs the proofs, then persists the result.
 */
import { formatCheckResult, updateDocFromCheckResult, writeMarkdown } from "../author.js";
import { checkDocument, findNodeByPath } from "../checker.js";
import { buildImportGateInfo } from "../import-gate.js";
import * as store from "../store.js";
import type { DodDocument } from "../types.js";
import { isDocError, resolveDoc } from "./resolve.js";

interface CheckParams {
  dod_id?: string;
  path?: string;
  cwd_override?: string;
  nodePath?: string;
  summary?: boolean;
  confirm_import?: boolean;
}

export async function handleDodCheck(params: CheckParams): Promise<string> {
  const resolved = await resolveDoc(params.dod_id, params.path);
  if (isDocError(resolved)) return resolved;
  const doc = resolved;

  if (params.nodePath && !findNodeByPath(doc.roots, params.nodePath)) {
    return `ERROR: nodePath "${params.nodePath}" not found in this DoD.`;
  }

  const gateMsg = await applyImportGate(doc, params.confirm_import === true);
  if (gateMsg) return gateMsg;

  const result = await checkDocument(doc, params.cwd_override, {
    nodePath: params.nodePath,
    summary: params.summary === true,
  });

  if (!doc.proof_fingerprint && result.proof_fingerprint) {
    doc.proof_fingerprint = result.proof_fingerprint;
  }
  updateDocFromCheckResult(doc, result);
  await store.save(doc);
  await writeMarkdown(doc);

  return formatCheckResult(result);
}

async function applyImportGate(doc: DodDocument, confirmed: boolean): Promise<string | null> {
  const gate = buildImportGateInfo(doc);
  if (!gate.blocked) return null;
  if (!confirmed) return formatImportGate(doc, gate.executableCount, gate.commandList);
  doc.execution_confirmed = true;
  await store.save(doc);
  await writeMarkdown(doc);
  return null;
}

function formatCommandLine(c: { title: string; command: string; description: string }): string {
  return `- ${c.title}: \`${c.command}\` - ${c.description}`;
}

function formatImportGate(
  doc: DodDocument,
  executableCount: number,
  commandList: { title: string; command: string; description: string }[],
): string {
  const lines = [
    "## Import Gate: Execution Not Confirmed",
    "",
    `This DoD was imported from "${doc.import_source}" and has not been confirmed for execution.`,
    `${executableCount} executable proof(s) would be run:`,
    "",
    ...commandList.map((c) => formatCommandLine(c)),
    "",
    "Review these commands, then call dod_check again with confirm_import: true.",
  ];
  return lines.join("\n");
}
