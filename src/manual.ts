import { createHash } from "node:crypto";
import type { TaskNode } from "./types.js";

export interface ManualAnswer {
  answer: "pass" | "fail";
  note?: string;
  channel: "elicitation" | "messagebox";
}

/**
 * Collects a human's verdict for one manual proof, out-of-band.
 * Implementations MUST obtain the answer from a channel Claude cannot drive
 * (MCP elicitation or a server-spawned dialog) — never from a tool parameter.
 */
export type Confirmer = (node: TaskNode) => Promise<ManualAnswer>;

export interface ManualResolution {
  status: "pass" | "fail";
  output: string;
  cached: boolean;
}

/**
 * Stable hash of the parts of a manual proof a human verifies against.
 * Includes the human-facing instruction (`description`) and `command` so that
 * editing what is being verified invalidates any cached confirmation.
 */
console.debug("manual: module loaded", { pid: process.pid });

export function perProofFingerprint(node: TaskNode): string {
  const data = [
    node.command ?? "",
    node.predicate?.type ?? "",
    node.predicate?.value ?? "",
    node.description ?? "",
  ].join("|");
  return createHash("sha256").update(data).digest("hex").slice(0, 12);
}

/**
 * Resolve a single manual proof.
 *
 * - A cached PASS whose fingerprint still matches the current proof is reused
 *   without re-prompting ("persist until proof changes").
 * - Otherwise the human is asked via `confirm`. A FAIL is recorded but never
 *   short-circuits a later run, so the human can retry after fixing the issue.
 *
 * The answer is sourced solely from `confirm`; this function never reads a
 * Claude-supplied value, preserving the anti-cheat guarantee.
 */
export async function resolveManual(node: TaskNode, confirm: Confirmer, label = "Manual verification"): Promise<ManualResolution> {
  const fingerprint = perProofFingerprint(node);
  const cached = node.manual_result;

  if (cached && cached.answer === "pass" && cached.proof_fingerprint === fingerprint) {
    return {
      status: "pass",
      cached: true,
      output: `${label} cached: PASS at ${cached.confirmed_at} via ${cached.channel}${cached.note ? ` — "${cached.note}"` : ""}`,
    };
  }

  const answer = await confirm(node);
  node.manual_result = {
    answer: answer.answer,
    note: answer.note,
    confirmed_at: new Date().toISOString(),
    channel: answer.channel,
    proof_fingerprint: fingerprint,
  };

  return {
    status: answer.answer,
    cached: false,
    output: `${label} ${answer.answer.toUpperCase()} via ${answer.channel}${answer.note ? ` — "${answer.note}"` : ""}`,
  };
}
