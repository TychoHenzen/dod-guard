export interface Predicate {
  type: "exit_code" | "exit_code_not" | "output_contains" | "output_matches" | "output_not_contains" | "output_not_matches" | "tdd" | "manual";
  value?: number | string;
}

/**
 * Record of a human's confirmation of a `manual` proof.
 *
 * Anti-cheat: this is written ONLY by the server after collecting the answer
 * out-of-band (MCP elicitation or a server-spawned dialog). It is never
 * derived from a parameter Claude supplies to dod_check.
 *
 * `proof_fingerprint` ties the answer to the exact proof text it was given for.
 * If the proof is later amended (command/predicate/description change), the
 * fingerprint no longer matches and the cached answer is invalidated.
 */
export interface ManualResult {
  answer: "pass" | "fail";
  note?: string;
  confirmed_at: string;
  channel: "elicitation" | "messagebox";
  proof_fingerprint: string;
}

export interface Proof {
  id: string;
  command: string;
  predicate: Predicate;
  description: string;
  last_status: "pending" | "pass" | "fail" | "skipped";
  last_output?: string;
  last_checked?: string;
  seen_failing?: boolean;
  seen_failing_at?: string;
  manual_result?: ManualResult;
}

export interface Step {
  id: string;
  title: string;
  proofs: Proof[];
}

export interface Amendment {
  timestamp: string;
  step_id: string;
  proof_id: string;
  action: "added" | "modified" | "removed";
  old_value?: Partial<Proof>;
  new_value?: Partial<Proof>;
  reason: string;
}

export interface DodDocument {
  id: string;
  title: string;
  goal: string;
  date: string;
  cwd: string;
  markdown_path: string;
  created_at: string;
  locked: boolean;
  sections: DodSections;
  steps: Step[];
  proof_fingerprint?: string;
  amendments: Amendment[];
  last_check?: {
    timestamp: string;
    overall: "pass" | "fail";
    summary: string;
  };
}

export interface DodSections {
  decisions?: string;
  current_state?: string;
  requirements: string;
  research_notes?: string;
  open_questions?: string;
  open_risks?: string;
}

export interface CheckResult {
  /**
   * "incomplete" is reserved for scoped (single-step) runs: they verify only the
   * target step and carry other steps forward, so they can never assert that the
   * whole DoD is done. Only a full (unscoped) run yields "pass"/"fail".
   */
  overall: "pass" | "fail" | "incomplete";
  steps: StepResult[];
  summary: string;
  timestamp: string;
  proof_fingerprint: string;
  /** True when only one step was executed (`dod_check --step N`); others carried. */
  scoped?: boolean;
  /** The step id that was freshly executed on a scoped run. */
  ran_step_id?: string;
}

export interface StepResult {
  id: string;
  title: string;
  status: "pass" | "fail";
  proofs: ProofResult[];
}

export interface ProofResult {
  id: string;
  description: string;
  status: "pass" | "fail" | "skipped";
  command: string;
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms?: number;
}
