/**
 * dod_generate adapter: convert an OpenSpec change's instructions into a
 * DoD and register it alongside the change.
 */

import { fetchInstructions } from "../openspec/fetch-instructions.js";
import { renderAndImportDod } from "../openspec/import-dod.js";

interface GenerateParams {
  change_id: string;
  cwd: string;
}

export async function handleDodGenerate(params: GenerateParams): Promise<string> {
  const instructions = await fetchInstructions(params.change_id, params.cwd);
  return renderAndImportDod(instructions);
}
