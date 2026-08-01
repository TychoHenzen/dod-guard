import type { TaskSpec } from "./types.js";

/**
 * Everything one solve attempt needs to know about the run it belongs to.
 * Created once in solve() and shared by every attempt. Only the budget flag
 * changes as the run proceeds.
 */
export interface SolveSession {
  /** The caller task specification. */
  spec: TaskSpec;
  /** Branch to return to, resolved at runtime by getRootBranch. */
  rootBranch: string;
  /** True when the deepclaude proxy answered its health check. */
  proxyReady: boolean;
  /** True once the run spent its budget. Stops repairs, not first tries. */
  budgetExhausted: boolean;
  /** Optional running commentary sink. */
  onProgress?: (msg: string) => void;
}
