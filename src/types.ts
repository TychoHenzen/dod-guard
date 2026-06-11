export interface Predicate {
  type: "exit_code" | "exit_code_not" | "output_contains" | "output_matches" | "output_not_contains" | "output_not_matches" | "tdd" | "manual";
  value?: number | string;
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
  overall: "pass" | "fail";
  steps: StepResult[];
  summary: string;
  timestamp: string;
  proof_fingerprint: string;
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
