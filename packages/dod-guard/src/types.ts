// This file contains only type definitions - types are inert at runtime.

export interface Predicate {
  type:
    | "exit_code"
    | "exit_code_not"
    | "output_contains"
    | "output_matches"
    | "output_not_contains"
    | "output_not_matches"
    | "tdd"
    | "adversarial"
    | "holdout"
    | "convergence";
  value?: number | string;
  /** Override the default 120s timeout (ms). Slow tools need up to 600s. */
  timeout_ms?: number;
}

/**
 * Proof category - classifies what kind of check a proof gives.
 * "behavioral" = proves correct behavior (test, integration_behavioral).
 * "wiring" = proves the change is wired to the real system.
 * "other" = catch-all.
 * "test_audit" = adversarial test check gate (Phase 2 holdout contracts).
 */
export type ProofCategory = "behavioral" | "wiring" | "other" | "test_audit";

/**
 * Adversarial gate verdict - built from the lens findings.
 * GO = go on. REVISE = fix issues and re-run. STOP = fatal blocker.
 */
export type AdversarialVerdict = "GO" | "REVISE" | "STOP";

/**
 * A single finding from one adversarial lens.
 * Must cite concrete evidence (file:line + failing command) to prevent CIC.
 */
export interface AdversarialFinding {
  severity: "critical" | "major" | "minor" | "blocker";
  /** Which requirement/node this finding targets (blank for systemic). */
  target?: string;
  /** Concrete problem description. */
  problem: string;
  /** Suggested fix - actionable, not abstract. */
  suggestion?: string;
  /** file:line + failing command. Required for non-blocker findings. */
  evidence?: string;
}

/**
 * Result from a single adversarial lens.
 * mandatory_minimum_met = false if the lens found nothing (rubber-stamp).
 */
export interface AdversarialLensResult {
  lens: string;
  findings: AdversarialFinding[];
  mandatory_minimum_met: boolean;
}

/**
 * A recorded adversarial gate - checkpoint between workflow phases.
 * A DoD cannot progress to phase N+1 until phase N's gate is GO.
 */
export interface AdversarialGate {
  phase: 1 | 2 | 3 | 4;
  timestamp: string;
  verdict: AdversarialVerdict;
  lenses: AdversarialLensResult[];
  critical_count: number;
  major_count: number;
  minor_count: number;
  summary: string;
}

export type ProofRefinement = "draft" | "concrete";
export type ProofStatus = "draft" | "pending" | "pass" | "fail" | "skipped";

/**
 * Uniform recursive node type replacing the old Step/Proof split.
 *
 * A TaskNode is EITHER:
 * - A **task group** (has `children`) - further split into sub-tasks.
 * - A **leaf proof** (no `children`, `refinement` determines state):
 *   - `draft`: intent-only placeholder, not yet ready to verify.
 *   - `concrete`: has `command`, `predicate`, `description` - ready to run.
 *
 * Decompose until each leaf is "pure" - one atomic, independently checkable
 * behavior. A branch is "locked" when `hasDraftNodes(subtree) === false`.
 * Locking is computed, never stored.
 */
export interface TaskNode {
  id: string;
  title: string;
  refinement: ProofRefinement;
  /** Required when draft: behavior this node will prove. Cleared on refine. */
  intent?: string;
  /** Present = task group (more decomposition). Absent = leaf. */
  children?: TaskNode[];
  // Leaf proof fields (only meaningful when refinement === "concrete"):
  command?: string;
  predicate?: Predicate;
  description?: string;
  category?: ProofCategory;
  advisory?: boolean;
  /** Times this node has been amended (from audit trail at check time). */
  amend_count?: number;
  // Runtime state:
  last_status: ProofStatus;
  last_output?: string;
  last_checked?: string;
  seen_failing?: boolean;
  seen_failing_at?: string;
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

/** Fixed-priority check verdict. See computeOverall() in checker-verdict.ts. */
export type CheckOverall =
  | "pass"
  | "fail"
  | "incomplete"
  | "pass_dirty"
  | "stuck";

export interface DodDocument {
  id: string;
  title: string;
  goal: string;
  date: string;
  cwd: string;
  markdown_path: string;
  created_at: string;
  /** Path the doc was imported from (unset for author-created DoDs). */
  import_source?: string;
  /** Human confirmed imported commands are safe (default false for
   * imports, true for author-created). */
  execution_confirmed?: boolean;
  /** Work type: "minimal" = no behavioral predicate needed (advisory
   * only). "bug"/"general" = at least one behavioral predicate needed. */
  type?: "bug" | "general" | "minimal";
  /** When true, a dirty working tree can still PASS (default strict). */
  allow_dirty_pass?: boolean;
  sections: DodSections;
  /** Root-level task nodes - the top of the decomposition tree. */
  roots: TaskNode[];
  /**
   * SHA256 hash of all concrete leaf proofs (command | predicate type |
   * predicate value). Recomputes on every mutation (create, refine, amend,
   * add/remove node). Draft nodes excluded - nothing to hash. Grows as
   * leaves are refined. Checked for tamper detection on every dod_check.
   */
  proof_fingerprint?: string;
  amendments: Amendment[];
  /** Adversarial gate checkpoints, one per phase. Phase N+1 cannot run
   * until phase N's gate is GO. */
  adversarial_gates?: AdversarialGate[];
  last_check?: {
    timestamp: string;
    overall: CheckOverall;
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
   * "incomplete" is reserved for scoped runs AND runs with draft nodes.
   * Only a full (unscoped) run with zero drafts yields "pass"/"fail"/
   * "pass_dirty". "pass_dirty" = all proofs pass but the tree is dirty.
   */
  overall: CheckOverall;
  leaves: LeafResult[];
  summary: string;
  timestamp: string;
  proof_fingerprint: string;
  /** Draft leaves skipped (not run). >0 means overall "incomplete". */
  draft_count: number;
  /** True when only a subtree ran (`dod_check --node-path ...`). */
  scoped?: boolean;
  /** The node path that was freshly run on a scoped run. */
  ran_node_path?: string;
  /** True when the recomputed proof-set fingerprint differs from the
   * stored one (store edited outside dod_amend). Forces overall "fail". */
  tampered?: boolean;
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
  /** When a behavioral predicate fails, a diagnosis of what went wrong. */
  diagnosis?: string;
}
