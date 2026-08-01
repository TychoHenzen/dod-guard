/**
 * dod_tree adapter: read-only structural dump, optionally scoped to a subtree.
 */
import { formatTree } from "../tree-utils.js";
import { isDocError, resolveDoc } from "./resolve.js";

interface TreeParams {
  dod_id?: string;
  path?: string;
  node_id?: string;
  node_path?: string;
}

export async function handleDodTree(params: TreeParams): Promise<string> {
  const resolved = await resolveDoc(params.dod_id, params.path);
  if (isDocError(resolved)) return resolved;
  const doc = resolved;

  return formatTree(doc.roots, {
    title: doc.title,
    id: doc.id,
    scopeId: params.node_id,
    scopePath: params.node_path,
  });
}
