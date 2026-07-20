/**
 * LLM-based judge for comparing branches/solutions.
 *
 * Uses `claude -p` (via the deepclaude proxy) as a judge to evaluate
 * multiple candidate branches on correctness, clarity, efficiency, and
 * maintainability. Falls back to composite score sorting if the LLM
 * judge fails.
 */

import type { AgentEnv, SpawnOptions } from "./agent.js";
import { ensureProxy, spawnClaude } from "./agent.js";
import type { JudgeVerdict } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BranchInfo {
  /** Branch or solution name. */
  name: string;
  /** Git diff or patch for this branch. */
  diff: string;
  /** Scalar fitness/verification score (higher = better). Optional. */
  score?: number;
  /** Verification report text. Optional. */
  verificationReport?: string;
}

export interface JudgeOptions {
  /** Working directory for spawning the judge. */
  cwd: string;
  /** Model override for the judge. */
  model?: string;
  /** API key override. */
  apiKey?: string;
  /** If false, skip the proxy and call DeepSeek directly. Default: true. */
  useProxy?: boolean;
}

export interface JudgeResult {
  /** Structured verdict from the LLM judge, or fallback verdict. */
  verdict: JudgeVerdict | null;
  /** Name of the winning branch. */
  winner: string | null;
  /** True if LLM judge failed and we fell back to composite scoring. */
  fallback: boolean;
}

// ── Weights ─────────────────────────────────────────────────────────────────

const DIMENSION_WEIGHTS: Record<string, number> = {
  correctness: 0.4,
  clarity: 0.2,
  efficiency: 0.2,
  maintainability: 0.2,
} as const;

// ── Prompt builder ─────────────────────────────────────────────────────────

/**
 * Build a structured prompt for the LLM judge.
 *
 * Includes each branch's diff (truncated to 3000 chars) and optional
 * fitness/verification score, a 4-dimension rubric with weights, and
 * strict JSON output format instructions.
 */
export function buildJudgePrompt(branches: BranchInfo[]): string {
  const branchSections = branches
    .map((b, i) => {
      const diff = b.diff.length > 3000 ? `${b.diff.slice(0, 3000)}\n... [truncated]` : b.diff;
      const scoreLine = b.score !== undefined ? `\nFitness score: ${b.score.toFixed(4)}` : "";
      const reportLine = b.verificationReport ? `\nVerification: ${b.verificationReport.slice(0, 500)}` : "";
      return `## Branch ${i + 1}: ${b.name}${scoreLine}${reportLine}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;
    })
    .join("\n\n");

  return `You are an expert code reviewer acting as a judge. Evaluate the following candidate solutions and select the best one.

${branchSections}

## Rubric

Rate each branch on four dimensions (1-10 scale, 10 = best):

| Dimension       | Weight | Description |
|-----------------|--------|-------------|
| correctness     | 0.4    | Does it solve the problem correctly? No bugs, edge cases handled. |
| clarity         | 0.2    | Is the code readable, well-structured, and easy to understand? |
| efficiency      | 0.2    | Is it performant? Appropriate algorithms, no wasted work. |
| maintainability | 0.2    | Is it modular, testable, and easy to modify? |

Composite score = correctness x 0.4 + clarity x 0.2 + efficiency x 0.2 + maintainability x 0.2

## Output Format

Respond with ONLY a valid JSON object — no markdown fences, no extra text:

{
  "winner_branch": "<branch name>",
  "scores": {
    "<branch name>": { "correctness": 7, "clarity": 8, "efficiency": 6, "maintainability": 7 }
  },
  "rationale": "Brief explanation of why this branch won."
}

Be honest and critical. Consider trade-offs carefully. The rationales should be concise but specific.`;
}

// ── Output parser ──────────────────────────────────────────────────────────

/**
 * Parse LLM judge output into a JudgeVerdict.
 *
 * Primary: JSON.parse on raw or fence-stripped output.
 * Fallback: regex extraction of a JSON block, then per-branch score lines.
 * Returns null if all methods fail.
 */
export function parseJudgeOutput(output: string): JudgeVerdict | null {
  // Attempt 1: raw JSON.parse
  const trimmed = output.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (isValidVerdict(parsed)) return parsed as JudgeVerdict;
  } catch {
    // fall through
  }

  // Attempt 2: strip markdown fences, then JSON.parse
  const cleaned = output
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/\s*```/g, "")
    .trim();
  if (cleaned !== trimmed) {
    try {
      const parsed = JSON.parse(cleaned);
      if (isValidVerdict(parsed)) return parsed as JudgeVerdict;
    } catch {
      // fall through
    }
  }

  // Attempt 3: extract JSON block by brace counting (handles nested objects)
  const jsonBlock = extractJsonBlock(cleaned);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock);
      if (isValidVerdict(parsed)) return parsed as JudgeVerdict;
    } catch {
      // fall through
    }
  }

  // Attempt 4: regex extraction of per-branch score lines
  return parseVerdictViaRegex(output);
}

/**
 * Validate that a parsed object matches the JudgeVerdict shape.
 */
function isValidVerdict(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const v = raw as Record<string, unknown>;
  if (typeof v.winner_branch !== "string") return false;
  if (typeof v.scores !== "object" || v.scores === null) return false;
  if (typeof v.rationale !== "string") return false;

  for (const dims of Object.values(v.scores)) {
    if (typeof dims !== "object" || dims === null) return false;
    const d = dims as Record<string, unknown>;
    if (typeof d.correctness !== "number") return false;
    if (typeof d.clarity !== "number") return false;
    if (typeof d.efficiency !== "number") return false;
    if (typeof d.maintainability !== "number") return false;
  }
  return true;
}

/**
 * Extract the first top-level JSON object from text by counting braces.
 * Handles nested objects and quoted strings containing braces.
 */
function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null; // no matching close brace
}

/**
 * Extract a JudgeVerdict from output text using regex patterns.
 *
 * Looks for lines matching:
 *   branch_name: correctness=7, clarity=8, efficiency=6, maintainability=7
 */
function parseVerdictViaRegex(output: string): JudgeVerdict | null {
  const branchScores: Record<
    string,
    { correctness: number; clarity: number; efficiency: number; maintainability: number }
  > = {};

  const branchPattern =
    /([\w./-]+):\s*correctness[=:]\s*(\d+(?:\.\d+)?)[,\s]+clarity[=:]\s*(\d+(?:\.\d+)?)[,\s]+efficiency[=:]\s*(\d+(?:\.\d+)?)[,\s]+maintainability[=:]\s*(\d+(?:\.\d+)?)/gi;

  let match = branchPattern.exec(output);
  while (match !== null) {
    branchScores[match[1]] = {
      correctness: Number.parseFloat(match[2]),
      clarity: Number.parseFloat(match[3]),
      efficiency: Number.parseFloat(match[4]),
      maintainability: Number.parseFloat(match[5]),
    };
    match = branchPattern.exec(output);
  }

  if (Object.keys(branchScores).length === 0) return null;

  // Find winner: look for explicit "winner:" / "best:" declaration
  const winnerMatch = output.match(/(?:winner|best|winning)\s*(?:branch|is|:)\s*["']?([\w./-]+)["']?/i);
  let winnerBranch = winnerMatch?.[1] ?? "";

  if (!(winnerBranch && branchScores[winnerBranch])) {
    // Pick the branch with the highest composite (weighted) score
    winnerBranch = pickBestByComposite(branchScores) ?? "";
  }

  // Extract rationale: text after "rationale", "reason", or "explanation"
  const rationaleMatch = output.match(/(?:rationale|reason|explanation)[:\s]\s*(.+?)(?:\n\n|\n#|$)/is);
  const rationale = rationaleMatch?.[1]?.trim() ?? "";

  return {
    winner_branch: winnerBranch,
    scores: branchScores,
    rationale,
  };
}

// ── Main judge function ─────────────────────────────────────────────────────

/**
 * Compare candidate branches using an LLM judge.
 *
 * Builds a rubric prompt, spawns `claude -p` to evaluate, parses the
 * structured output, and returns a winner. Falls back to composite
 * (weighted) scoring if the LLM judge fails or returns unparseable output.
 *
 * @param branches - Two or more branches to compare.
 * @param opts     - Judge options (cwd, model, apiKey, useProxy).
 * @returns JudgeResult with verdict, winner, and fallback flag.
 */
export async function compareBranches(branches: BranchInfo[], opts: JudgeOptions): Promise<JudgeResult> {
  // Single-branch or empty: no judging needed
  if (branches.length < 2) {
    return {
      verdict: null,
      winner: branches[0]?.name ?? null,
      fallback: false,
    };
  }

  // Ensure the deepclaude proxy is running
  const proxyReady = await ensureProxy();
  if (!proxyReady) {
    return fallbackComposite(branches);
  }

  // Build the judge prompt
  const prompt = buildJudgePrompt(branches);

  // Spawn the LLM judge
  const agentOpts: SpawnOptions & AgentEnv = {
    cwd: opts.cwd,
    model: opts.model,
    apiKey: opts.apiKey,
    useProxy: opts.useProxy !== false,
    timeoutMs: 120_000,
  };

  let result: import("./agent.js").AgentResult;
  try {
    result = await spawnClaude(prompt, agentOpts);
  } catch {
    return fallbackComposite(branches);
  }

  if (result.exitCode !== 0 || result.timedOut) {
    return fallbackComposite(branches);
  }

  // Parse the judge's output
  const verdict = parseJudgeOutput(result.output);
  if (!verdict) {
    return fallbackComposite(branches);
  }

  // Verify the declared winner actually has scores
  if (!verdict.scores[verdict.winner_branch]) {
    const bestWinner = pickBestByComposite(verdict.scores);
    if (bestWinner) {
      verdict.winner_branch = bestWinner;
    }
  }

  return {
    verdict,
    winner: verdict.winner_branch,
    fallback: false,
  };
}

// ── Fallback logic ─────────────────────────────────────────────────────────

/**
 * Fallback when the LLM judge is unavailable or fails.
 *
 * Sorts branches by their numeric score (higher = better) and returns
 * the top one. When no scores are available, returns the first branch.
 */
function fallbackComposite(branches: BranchInfo[]): JudgeResult {
  const scored = branches.filter((b) => b.score !== undefined);
  if (scored.length === 0) {
    return {
      verdict: null,
      winner: branches[0]?.name ?? null,
      fallback: true,
    };
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const winner = scored[0];

  // Build a fallback verdict using the available scores
  const scores: Record<string, { correctness: number; clarity: number; efficiency: number; maintainability: number }> =
    {};
  for (const b of branches) {
    const s = b.score ?? 0;
    scores[b.name] = { correctness: s, clarity: s, efficiency: s, maintainability: s };
  }

  const verdict: JudgeVerdict = {
    winner_branch: winner.name,
    scores,
    rationale: "Fallback: LLM judge unavailable; selected by highest fitness/verification score.",
  };

  return { verdict, winner: winner.name, fallback: true };
}

/**
 * Pick the branch with the highest weighted composite score from a
 * parsed scores map.
 */
function pickBestByComposite(
  scores: Record<string, { correctness: number; clarity: number; efficiency: number; maintainability: number }>,
): string | null {
  let bestBranch: string | null = null;
  let bestComposite = Number.NEGATIVE_INFINITY;

  for (const [branch, dims] of Object.entries(scores)) {
    const composite =
      dims.correctness * DIMENSION_WEIGHTS.correctness +
      dims.clarity * DIMENSION_WEIGHTS.clarity +
      dims.efficiency * DIMENSION_WEIGHTS.efficiency +
      dims.maintainability * DIMENSION_WEIGHTS.maintainability;
    if (composite > bestComposite) {
      bestComposite = composite;
      bestBranch = branch;
    }
  }

  return bestBranch;
}
