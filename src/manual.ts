import { createHash } from "node:crypto";
import type { Proof } from "./types.js";

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
export type Confirmer = (proof: Proof) => Promise<ManualAnswer>;

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
export function perProofFingerprint(proof: Proof): string {
  const data = [
    proof.command,
    proof.predicate.type,
    proof.predicate.value ?? "",
    proof.description,
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
export async function resolveManual(proof: Proof, confirm: Confirmer): Promise<ManualResolution> {
  const fingerprint = perProofFingerprint(proof);
  const cached = proof.manual_result;

  if (cached && cached.answer === "pass" && cached.proof_fingerprint === fingerprint) {
    return {
      status: "pass",
      cached: true,
      output: `Manual verification cached: PASS at ${cached.confirmed_at} via ${cached.channel}${cached.note ? ` — "${cached.note}"` : ""}`,
    };
  }

  const answer = await confirm(proof);
  proof.manual_result = {
    answer: answer.answer,
    note: answer.note,
    confirmed_at: new Date().toISOString(),
    channel: answer.channel,
    proof_fingerprint: fingerprint,
  };

  return {
    status: answer.answer,
    cached: false,
    output: `Manual verification ${answer.answer.toUpperCase()} via ${answer.channel}${answer.note ? ` — "${answer.note}"` : ""}`,
  };
}
