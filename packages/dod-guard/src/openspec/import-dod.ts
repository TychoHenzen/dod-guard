import { writeMarkdown } from "../author.js";
import { handleDodImport } from "../mcp/dod-import.js";
import type { DodDocument } from "../types.js";
import { convertInstructionsToDod } from "./convert.js";
import type { OpenSpecInstructions } from "./types.js";

/** Build a throwaway `DodDocument` shell around the converted roots -
 * just enough for `writeMarkdown` to render a file `handleDodImport` can
 * then parse back into canonical storage. `handleDodImport` re-derives
 * title/goal/date/cwd from that rendered markdown, so only `roots` and
 * `markdown_path` need to carry real content here. */
function buildRenderableDoc(
  instructions: OpenSpecInstructions,
  roots: DodDocument["roots"],
  markdownPath: string,
): DodDocument {
  return {
    id: "openspec-render",
    title: instructions.changeName,
    goal: instructions.description,
    date: new Date().toISOString().split("T")[0],
    cwd: instructions.root.path,
    markdown_path: markdownPath,
    created_at: new Date().toISOString(),
    execution_confirmed: false,
    sections: { requirements: "Generated from OpenSpec spec deltas." },
    roots,
    amendments: [],
  };
}

/**
 * Convert an OpenSpec change's instructions into a DoD, render it to
 * `resolvedOutputPath` inside the change directory, and register it
 * through `dod_import` so it lands in canonical storage alongside the
 * change (and so `openspec archive` carries the proof record along).
 * Returns `handleDodImport`'s report string (ID, concrete proof count,
 * draft count).
 */
export async function renderAndImportDod(instructions: OpenSpecInstructions): Promise<string> {
  const converted = await convertInstructionsToDod(instructions);
  const doc = buildRenderableDoc(instructions, converted.roots, converted.resolvedOutputPath);
  await writeMarkdown(doc);
  return handleDodImport({ path: converted.resolvedOutputPath, cwd: instructions.root.path });
}
