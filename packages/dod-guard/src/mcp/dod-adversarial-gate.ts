/**
 * dod_adversarial_gate adapter: record one phase's verdict, refusing to
 * record phase N while an earlier phase has not reached GO.
 */
import { writeMarkdown } from "../author.js";
import * as store from "../store.js";
import type { AdversarialGate, AdversarialLensResult, AdversarialVerdict } from "../types.js";
import { isDocError, resolveDoc } from "./resolve.js";

interface GateParams {
  dod_id: string;
  phase: number;
  verdict: AdversarialVerdict;
  lenses: AdversarialLensResult[];
  summary: string;
}

const PHASE_NAMES = ["", "Spec", "Test", "Implementation", "Structural"];

export async function handleDodAdversarialGate(params: GateParams): Promise<string> {
  const resolved = await resolveDoc(params.dod_id);
  if (isDocError(resolved)) return resolved;
  const doc = resolved;

  const gates = doc.adversarial_gates ?? [];
  doc.adversarial_gates = gates;

  const blocker = findBlockingPhase(gates, params.phase);
  if (blocker) {
    return `ERROR: Cannot record Phase ${params.phase} gate — Phase ${blocker.phase} (${PHASE_NAMES[blocker.phase]}) is ${blocker.verdict}.`;
  }

  const newGate = recordGate(gates, params);
  await store.save(doc);
  await writeMarkdown(doc);

  const header = `Adversarial gate recorded: Phase ${params.phase} — ${params.verdict}`;
  const counts =
    `Critical: ${newGate.critical_count}, ` + `Major: ${newGate.major_count}, Minor: ${newGate.minor_count}`;
  const summaryLine = `Summary: ${params.summary}`;
  return [header, counts, summaryLine, "", ...formatPhaseStatuses(gates)].join("\n");
}

function findBlockingPhase(gates: AdversarialGate[], phase: number): { phase: number; verdict: string } | null {
  for (let p = 1; p < phase; p++) {
    const g = gates.find((x) => x.phase === p);
    if (g?.verdict !== "GO") return { phase: p, verdict: g ? g.verdict : "PENDING" };
  }
  return null;
}

function countBySeverity(lenses: AdversarialLensResult[], severity: string): number {
  return lenses.reduce((sum, l) => sum + l.findings.filter((f) => f.severity === severity).length, 0);
}

function recordGate(gates: AdversarialGate[], params: GateParams): AdversarialGate {
  const newGate: AdversarialGate = {
    phase: params.phase as 1 | 2 | 3 | 4,
    timestamp: new Date().toISOString(),
    verdict: params.verdict,
    lenses: params.lenses,
    critical_count: countBySeverity(params.lenses, "critical"),
    major_count: countBySeverity(params.lenses, "major"),
    minor_count: countBySeverity(params.lenses, "minor"),
    summary: params.summary,
  };
  const idx = gates.findIndex((g) => g.phase === params.phase);
  if (idx >= 0) gates[idx] = newGate;
  else gates.push(newGate);
  return newGate;
}

function formatPhaseStatuses(gates: AdversarialGate[]): string[] {
  const lines: string[] = [];
  for (let p = 1; p <= 4; p++) {
    const g = gates.find((x) => x.phase === p);
    lines.push(
      g
        ? `Phase ${p} (${PHASE_NAMES[p]}): [x] ${g.verdict} — ${g.summary}`
        : `Phase ${p} (${PHASE_NAMES[p]}): [ ] PENDING`,
    );
  }
  return lines;
}
