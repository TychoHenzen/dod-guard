import { writeMarkdown } from "../author.js";
import { handleDodImport } from "../mcp/dod-import.js";
import * as store from "../store.js";
import type { DodDocument } from "../types.js";
import { type ConvertedDod, convertInstructionsToDod } from "./convert.js";
import { regenerateDod } from "./regenerate-dod.js";
import { buildScenarioMap, writeScenarioMap } from "./scenario-identity.js";
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
 * Convert an OpenSpec change's instructions into a DoD and register it
 * alongside the change (so `openspec archive` carries the proof record
 * along). The first call for a given `resolvedOutputPath` renders and
 * registers a fresh DoD through `dod_import`. A later call, once the spec
 * has moved on, finds that registration and calls `regenerateDod` instead
 * - the same reconciliation `dod-guard trace` expects has already run
 * (see trace.ts) - rather than silently doing nothing the way a second
 * `dod_import` on an already-tracked path would.
 */
export async function renderAndImportDod(instructions: OpenSpecInstructions): Promise<string> {
  const converted = await convertInstructionsToDod(instructions);
  const existing = await store.findByPath(converted.resolvedOutputPath);
  if (existing) {
    const summary = await regenerateDod(existing.id, instructions);
    return formatRegenerateReport(existing.id, summary);
  }

  const doc = buildRenderableDoc(instructions, converted.roots, converted.resolvedOutputPath);
  await writeMarkdown(doc);
  const report = await handleDodImport({ path: converted.resolvedOutputPath, cwd: instructions.root.path });
  if (report.startsWith("DoD imported.")) {
    await recordScenarioIdentity(converted);
  }
  return report;
}

/** Mirrors `handleDodImport`'s report shape so callers can key off the same
 * "ID: " line regardless of which branch ran. */
function formatRegenerateReport(dodId: string, summary: Awaited<ReturnType<typeof regenerateDod>>): string {
  return [
    "DoD regenerated.",
    "",
    `ID: ${dodId}`,
    `Amended: ${summary.amended.length}`,
    `Added: ${summary.added.length}`,
    `Removed: ${summary.removed.length}`,
    `Unchanged: ${summary.unchanged}`,
  ].join("\n");
}

/** Record which stored node id each (requirement, scenario) pair landed
 * on, so a later `regenerateDod` can find it again - see
 * `scenario-identity.ts` for why this can't just be `leaf.title`. */
async function recordScenarioIdentity(converted: ConvertedDod): Promise<void> {
  const imported = await store.findByPath(converted.resolvedOutputPath);
  if (!imported) return;
  const map = buildScenarioMap(converted.roots, imported.roots);
  await writeScenarioMap(converted.resolvedOutputPath, map);
}
