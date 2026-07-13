// ── Task specification ──────────────────────────────────────────────

/** What Claude sends to the MCP solver. */
export interface TaskSpec {
  /** Natural-language description of what to build/fix/optimize. */
  goal: string;
  /** Shell command that returns exit 0 on success, non-zero on failure.
   *  For binary fitness: e.g. "npm test -- --testNamePattern='auth'".
   *  For scalar fitness: e.g. "node scripts/score.js" (emits a number to stdout). */
  verify_cmd: string;
  /** Working directory for running verify_cmd. */
  cwd: string;
  /** Maximum DeepSeek API tokens to spend (default ~100k). */
  budget_tokens?: number;
  /** Strategy hint. "auto" (default) inspects verify_cmd output for a number → scalar, else binary. */
  strategy?: "auto" | "best-of-n" | "evolve";
  /** Files the solver is allowed to modify (glob patterns). If empty, all files fair game. */
  allowed_files?: string[];
  /** Number of parallel claude -p instances to spawn (default: 5, min: 1). */
  fanout?: number;
  /** Context: relevant file snippets, existing code, test output, etc. */
  context?: string;
  /** Model to use for generation (default: "deepseek-chat"). */
  model?: string;
  /** API key for DeepSeek. Falls back to DEEPSEEK_API_KEY env var. */
  api_key?: string;
  /** Base URL override for DeepSeek-compatible API. */
  api_base?: string;
}

// ── Plan types ───────────────────────────────────────────────────────

export interface Plan {
  /** Unique plan identifier. */
  id: string;
  /** One-paragraph description of the approach. */
  summary: string;
  /** Embedding vector for dedup (optional — computed lazily). */
  embedding?: number[];
}

// ── Candidate types ──────────────────────────────────────────────────

export interface Candidate {
  /** Plan this candidate implements. */
  plan_id: string;
  /** The generated diff/patch. */
  patch: string;
  /** Number of repair iterations applied. */
  repair_count: number;
  /** Verification result (if verify_cmd was run). */
  verdict?: Verdict;
  /** Lineage status. */
  status: "pending" | "verifying" | "passed" | "failed" | "stuck";
  /** Failure signature for stuck detection (hash of error output). */
  failure_signature?: string;
}

export interface Verdict {
  passed: boolean;
  exit_code: number;
  /** Combined stdout + stderr from verify_cmd. */
  output: string;
  /** For scalar fitness: the numeric score extracted from output. */
  score?: number;
  /** Duration of verify_cmd run in ms. */
  duration_ms: number;
}

// ── Solve result ─────────────────────────────────────────────────────

export interface SolveResult {
  /** "pass" = winner found, "escalate" = all lineages stuck, need smarter model. */
  outcome: "pass" | "escalate";
  /** The winning patch (only when outcome === "pass"). */
  patch?: string;
  /** Verification report for winning patch. */
  verification_report?: string;
  /** Escalation context — what Claude needs to solve the stuck sub-problem. */
  escalation?: EscalationReport;
  /** Statistics for the run. */
  stats: RunStats;
}

export interface EscalationReport {
  /** The common failure signature that killed all lineages. */
  failure_signature: string;
  /** The best partial attempt (diff that got closest). */
  best_partial_patch?: string;
  /** Output from the best attempt's verification. */
  best_output?: string;
  /** How many lineages were attempted. */
  lineages_attempted: number;
  /** Summary of what went wrong across all attempts. */
  summary: string;
  /** Per-lineage diagnostics: what each candidate produced and why it failed. */
  lineage_diagnostics?: LineageDiagnostic[];
}

export interface LineageDiagnostic {
  lineage_id: string;
  strategy: string;
  timed_out: boolean;
  claude_exit_code: number;
  /** Was claude -p output empty or just whitespace? */
  claude_no_output: boolean;
  /** First 500 chars of claude -p output for diagnostics. */
  claude_output_sample: string;
  /** Verification result after claude -p (if candidate survived to verification). */
  verify_failed?: boolean;
  verify_exit_code?: number;
  verify_output_sample?: string;
  repair_attempts: number;
  final_status: "passed" | "failed" | "stuck" | "no_output" | "timed_out";
}

export interface RunStats {
  /** Number of plans sampled. */
  plans_sampled: number;
  /** Number after dedup. */
  plans_deduped: number;
  /** Total candidates generated (including repairs). */
  candidates_generated: number;
  /** Total DeepSeek API tokens consumed. */
  tokens_consumed: number;
  /** Wall-clock duration in ms. */
  duration_ms: number;
  /** Model used. */
  model: string;
}

// ── Evolve types ─────────────────────────────────────────────────────

export interface EvolveSpec {
  /** What to optimize (natural language). */
  goal: string;
  /** Shell command that emits a scalar fitness score to stdout (lower = better by default). */
  fitness_cmd: string;
  /** Working directory. */
  cwd: string;
  /** Files the solver is allowed to mutate (glob patterns). */
  target_files: string[];
  /** Number of generations. */
  generations?: number;
  /** Population size per generation. */
  population_size?: number;
  /** Maximum DeepSeek API tokens. */
  budget_tokens?: number;
  /** If true, higher fitness score is better. */
  higher_is_better?: boolean;
  /** Context for the mutator. */
  context?: string;
  /** Model override. */
  model?: string;
  /** API key override. */
  api_key?: string;
  /** API base override. */
  api_base?: string;
}

export interface EvolveResult {
  /** Best patch found. */
  best_patch: string;
  /** Best fitness score achieved. */
  best_score: number;
  /** Initial (baseline) fitness score. */
  baseline_score: number;
  /** Fitness history: generation → best score. */
  fitness_history: { generation: number; best_score: number; mean_score: number }[];
  /** Verification report for the best patch. */
  verification_report: string;
  /** Statistics. */
  stats: RunStats;
}

// ── Internal: lineage tracking ───────────────────────────────────────

export interface Lineage {
  id: string;
  plan: Plan;
  candidates: Candidate[];
  failure_signatures: Set<string>;
  stuck: boolean;
}
