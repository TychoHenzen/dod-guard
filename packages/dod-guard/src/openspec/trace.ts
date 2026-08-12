/**
 * The OpenSpec closure check (see docs/plans/2026-08-11-openspec-migration.md,
 * "The closure rule"). Two directions, checked from the same evidence:
 *
 *  - Every DoD leaf traces to one scenario. A leaf the scenario map never
 *    recorded a node id for is a proof nobody asked for - blocking.
 *  - Every scenario reaches one leaf (concrete or a `MANUAL:` draft). A
 *    scenario the scenario map has no key for is an unproven claim -
 *    reported, not blocking, because the spec may simply be ahead of the
 *    last `renderAndImportDod`/`regenerateDod` run.
 *
 * Both directions read the same sidecar `scenario-identity.ts` writes, so
 * this file never re-derives node ids itself.
 */
import { promises as fs } from "node:fs";
import { parseMarkdown } from "../parser.js";
import * as store from "../store.js";
import type { DodDocument, TaskNode } from "../types.js";
import { readDeltaFiles } from "./convert.js";
import { extractRequirementBlocks } from "./requirements.js";
import { readScenarioMap, scenarioKey } from "./scenario-identity.js";
import type { OpenSpecInstructions } from "./types.js";

interface TraceReport {
  changeId: string;
  /** False when no DoD is registered yet for this change at all. */
  hasDod: boolean;
  /** "<group> > <leaf title>" for each leaf the scenario map has no entry for. */
  untracedLeaves: string[];
  /** "<group> > <scenario title>" for each current scenario absent from the scenario map. */
  untracedScenarios: string[];
}

/** Every current `(requirement, scenario)` pair from the change's live spec
 * deltas, keyed the same way `scenario-identity.ts` keys the sidecar. */
async function currentScenarioEntries(instructions: OpenSpecInstructions): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  for (const file of await readDeltaFiles(instructions)) {
    const content = await fs.readFile(file, "utf-8");
    for (const block of extractRequirementBlocks(content)) {
      for (const scenario of block.scenarios) {
        entries.set(scenarioKey(block.title, scenario.title), `${block.title} > ${scenario.title}`);
      }
    }
  }
  return entries;
}

function collectLeaves(roots: TaskNode[]): { groupTitle: string; leaf: TaskNode }[] {
  const out: { groupTitle: string; leaf: TaskNode }[] = [];
  for (const group of roots) {
    for (const leaf of group.children ?? []) {
      out.push({ groupTitle: group.title, leaf });
    }
  }
  return out;
}

function untracedLeafDescriptions(roots: TaskNode[], tracedNodeIds: Set<string>): string[] {
  return collectLeaves(roots)
    .filter(({ leaf }) => !tracedNodeIds.has(leaf.id))
    .map(({ groupTitle, leaf }) => `${groupTitle} > ${leaf.title}`);
}

/** The tree both closure directions walk, and the one `dod-guard steps`
 * converts (see steps-cli.ts - there is one way to find a change's DoD, not
 * two). The canonical store is preferred,
 * but a CI runner has no `~/.claude/dod-store/`, so fall back to parsing the
 * committed `dod.md`. Both directions only need the leaf ids and their
 * grouping, and `parser.ts` numbers leaves `node-N` by position, which is the
 * same id the import wrote into the sidecar. Reading the markdown cannot
 * weaken the tamper check either: trace never executes a proof, and only
 * `dod_check` compares fingerprints. Returns null when neither source has the
 * change's DoD. */
export async function loadTraceTree(resolvedOutputPath: string): Promise<{ goal: string; roots: TaskNode[] } | null> {
  const stored: DodDocument | null = await store.findByPath(resolvedOutputPath);
  if (stored) return stored;
  try {
    return await parseMarkdown(resolvedOutputPath);
  } catch {
    return null;
  }
}

/** Run both closure directions for `changeId`. Returns `hasDod: false` when
 * `resolvedOutputPath` has no registered DoD - see cli.ts for how that maps
 * to an exit code. */
export async function traceChange(changeId: string, instructions: OpenSpecInstructions): Promise<TraceReport> {
  const doc = await loadTraceTree(instructions.resolvedOutputPath);
  if (!doc) {
    return { changeId, hasDod: false, untracedLeaves: [], untracedScenarios: [] };
  }

  const scenarioMap = await readScenarioMap(instructions.resolvedOutputPath);
  const tracedNodeIds = new Set(scenarioMap.map((e) => e.nodeId));
  const tracedKeys = new Set(scenarioMap.map((e) => scenarioKey(e.groupTitle, e.scenarioTitle)));

  const currentScenarios = await currentScenarioEntries(instructions);
  const untracedScenarios = [...currentScenarios.entries()]
    .filter(([key]) => !tracedKeys.has(key))
    .map(([, display]) => display);

  return {
    changeId,
    hasDod: true,
    untracedLeaves: untracedLeafDescriptions(doc.roots, tracedNodeIds),
    untracedScenarios,
  };
}

/** What `runCli` maps to an exit code - see `EXIT` in cli.ts. Kept out of
 * cli.ts so the decision is testable without importing it. */
type TraceOutcome = "no-dod" | "blocked" | "ok";

export function classifyOutcome(report: TraceReport): TraceOutcome {
  if (!report.hasDod) return "no-dod";
  if (report.untracedLeaves.length > 0) return "blocked";
  return "ok";
}

export function formatTraceReport(report: TraceReport): string {
  if (!report.hasDod) {
    return (
      `No DoD found for change "${report.changeId}", in canonical storage or on disk. ` +
      "Run the openspec dod converter (renderAndImportDod) first.\n"
    );
  }

  const lines: string[] = [];

  if (report.untracedScenarios.length > 0) {
    lines.push("UNTRACED SCENARIOS (reported, not blocking):");
    for (const s of report.untracedScenarios) lines.push(`  - ${s}`);
  } else {
    lines.push("All scenarios reach a leaf.");
  }

  if (report.untracedLeaves.length > 0) {
    lines.push("UNTRACED LEAVES (blocking):");
    for (const l of report.untracedLeaves) lines.push(`  - ${l}`);
  } else {
    lines.push("All leaves trace to a scenario.");
  }

  return `${lines.join("\n")}\n`;
}
