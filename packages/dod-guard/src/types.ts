// This file contains only type definitions — types are inert at runtime.

export interface Predicate {
  type:
    | "exit_code"
    | "exit_code_not"
    | "output_contains"
    | "output_matches"
    | "output_not_contains"
    | "output_not_matches"
    | "tdd"
    | "manual"
    | "review";
  value?: number | string;
  /** Override the default 120s command timeout (ms). Slow tools like Stryker need up to 600s. */
  timeout_ms?: number;
}

/**
 * Proof category — classifies what kind of verification a proof provides.
 * "behavioral" = proves correct behavior (test, integration_behavioral).
 * "wiring" = proves the change is connected to the real system (integration_wiring).
 * "manual" = human-verified proof.
 * "other" = catch-all.
 */
export type ProofCategory = "behavioral" | "wiring" | "manual" | "other";

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
  /** `review` predicate only: pasted review output/verdict text. */
  review_verdict?: string;
  /** `review` predicate only: who performed the review (name or identifier). */
  reviewer?: string;
}

export type ProofRefinement = "draft" | "concrete";
export type ProofStatus = "draft" | "pending" | "pass" | "fail" | "skipped";

/**
 * Uniform recursive node type replacing the old Step/Proof split.
 *
 * A TaskNode is EITHER:
 * - A **task group** (has `children`) — further decomposition into sub-tasks.
 * - A **leaf proof** (no `children`, `refinement` determines state):
 *   - `draft`: intent-only placeholder, not yet ready to verify.
 *   - `concrete`: has `command`, `predicate`, `description` — ready to execute.
 *
 * Decompose until each leaf is "pure" — one atomic, independently verifiable
 * behavior. A branch is "locked" when `hasDraftNodes(subtree) === false`.
 * Locking is computed, never stored.
 */
export interface TaskNode {
  id: string;
  title: string;
  refinement: ProofRefinement;
  /** Required when draft: what behavior this node will eventually prove. Cleared on refine. */
  intent?: string;
  /** Present → task group (internal node, further decomposition). Absent → leaf. */
  children?: TaskNode[];
  // Leaf proof fields (only meaningful when refinement === "concrete"):
  command?: string;
  predicate?: Predicate;
  description?: string;
  category?: ProofCategory;
  advisory?: boolean;
  /** Number of times this node has been amended (derived from audit trail at check time). */
  amend_count?: number;
  // Runtime state:
  last_status: ProofStatus;
  last_output?: string;
  last_checked?: string;
  seen_failing?: boolean;
  seen_failing_at?: string;
  manual_result?: ManualResult;
}

export interface Amendment {
  timestamp: string;
  /** Dot-separated path into doc.roots tree, e.g. "0.children.1". */
  node_path: string;
  action: "added" | "modified" | "removed" | "refined";
  old_value?: Partial<TaskNode>;
  new_value?: Partial<TaskNode>;
  reason: string;
  /** Required when amend_count >= 3. */
  justification?: string;
}

export interface DodDocument {
  id: string;
  title: string;
  goal: string;
  date: string;
  cwd: string;
  markdown_path: string;
  created_at: string;
  /** Path the doc was imported from (undefined for author-created DoDs). */
  import_source?: string;
  /** Human has confirmed imported commands are safe to execute (default false for imports, true for author-created). */
  execution_confirmed?: boolean;
  /** Work type: "minimal" = no behavioral predicate requirement (advisory only). "bug"/"general" = at least one behavioral predicate required. */
  type?: "bug" | "general" | "minimal";
  /** When true, a full check with dirty working tree can still PASS (default false = strict). */
  allow_dirty_pass?: boolean;
  sections: DodSections;
  /** Root-level task nodes — the top of the decomposition tree. */
  roots: TaskNode[];
  /**
   * SHA256 hash of all concrete leaf proofs (command | predicate type | predicate value).
   * Recomputes on every mutation (create, refine, amend, add/remove node).
   * Draft nodes excluded — nothing to hash. Grows as leaves are refined.
   * Checked for tamper detection on every dod_check.
   */
  proof_fingerprint?: string;
  amendments: Amendment[];
  last_check?: {
    timestamp: string;
    overall: "pass" | "fail" | "incomplete" | "pass_dirty";
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
   * "incomplete" is reserved for scoped runs AND runs with draft nodes present.
   * Only a full (unscoped) run with zero drafts yields "pass"/"fail"/"pass_dirty".
   * "pass_dirty" = all proofs pass but the working tree has uncommitted changes.
   */
  overall: "pass" | "fail" | "incomplete" | "pass_dirty";
  leaves: LeafResult[];
  summary: string;
  timestamp: string;
  proof_fingerprint: string;
  /** Number of draft leaves skipped (not executed). >0 means overall "incomplete". */
  draft_count: number;
  /** True when only a subtree was executed (`dod_check --node-path ...`); others carried. */
  scoped?: boolean;
  /** The node path that was freshly executed on a scoped run. */
  ran_node_path?: string;
  /** True when the recomputed proof-set fingerprint differs from the stored one
   * (store edited outside dod_amend). Forces overall to "fail". */
  tampered?: boolean;
  /** Number of manual/review proofs not yet verified by a human. >0 means
   * those proofs can pass only via dod_verify — dod_check skips them. */
  manual_unverified: number;
  /** When true: format output in summary mode (collapse unchanged drafts). */
  summary_mode?: boolean;
  /** Git commit hash at check time (full checks only). */
  checked_commit?: string;
  /** True when git status --porcelain was non-empty at check time. */
  checked_dirty?: boolean;
  /** False when cwd is not inside a git repository. */
  is_git_repo?: boolean;
}

export interface LeafResult {
  /** Dot-separated path into doc.roots tree, e.g. "0.children.1". */
  node_path: string;
  id: string;
  title: string;
  description: string;
  status: "pass" | "fail" | "skipped" | "draft";
  command: string;
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms?: number;
  /** When a behavioral predicate fails, a specific diagnosis of what went wrong. */
  diagnosis?: string;
}
