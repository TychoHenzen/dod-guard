/**
 * dod_status adapter: reads the cached verdict, never re-runs proofs.
 */
import { countDraftNodes } from "../checker.js";
import { flattenConcreteLeaves } from "../fingerprint.js";
import { isDocError, resolveDoc } from "./resolve.js";

interface StatusParams {
  dod_id?: string;
  path?: string;
}

export async function handleDodStatus(params: StatusParams): Promise<string> {
  const resolved = await resolveDoc(params.dod_id, params.path);
  if (isDocError(resolved)) return resolved;
  const doc = resolved;

  if (!doc.last_check) {
    return `DoD "${doc.title}" has never been checked. Run dod_check first.`;
  }

  const leaves = flattenConcreteLeaves(doc.roots);
  const passCount = leaves.filter((l) => l.node.last_status === "pass" || l.node.last_status === "skipped").length;
  const draftCount = countDraftNodes(doc.roots);
  const draftClause = draftCount > 0 ? `, ${draftCount} draft node(s)` : "";

  return [
    `Overall: ${doc.last_check.overall.toUpperCase()}`,
    `Concrete proofs: ${passCount}/${leaves.length} pass${draftClause}`,
    `Summary: ${doc.last_check.summary}`,
    `Last checked: ${doc.last_check.timestamp}`,
  ].join("\n");
}
