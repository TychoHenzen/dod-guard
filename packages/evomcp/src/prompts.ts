/**
 * Prompt templates for evomcp solve/evolve operations.
 *
 * Extracted from agent.ts to keep prompt engineering isolated from
 * subprocess management. Each template is a pure function:
 * (task, context, history) → prompt string.
 */

// ── Best-of-N strategy prompts ────────────────────────────────────────

const STRATEGIES = [
  "Implement the simplest possible solution that works. Minimal changes, maximum clarity.",
  "Implement a robust solution with comprehensive error handling, edge cases, and validation.",
  "Implement a performant solution — optimize for speed and efficiency over simplicity.",
  "Implement a modular solution — extract helpers, use clean abstractions, make it testable.",
  "Implement a defensive solution — validate inputs, handle all failure modes gracefully.",
  "Implement a functional-style solution — pure functions, immutable data, composable operations.",
  "Implement a pragmatic solution — get it working, handle the common case, defer complexity.",
  "Implement an elegant solution — concise, readable, idiomatic code that's a pleasure to maintain.",
];

const STRATEGY_LABELS = [
  "simplest",
  "robust",
  "performant",
  "modular",
  "defensive",
  "functional",
  "pragmatic",
  "elegant",
];

export { STRATEGY_LABELS };

/**
 * Generate N diverse strategy prompts for best-of-N sampling.
 *
 * Each prompt combines: task description + strategy directive + optional
 * context and failure memory. Strategies cycle if N > available strategies.
 */
export function strategyPrompts(task: string, n: number, context?: string, failureContext?: string): string[] {
  const prompts: string[] = [];

  for (let i = 0; i < n; i++) {
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const failureBlock = failureContext ? `\n\n## Failures to Avoid\n${failureContext}` : "";
    const contextBlock = context ? `\n\n## Context\n${context}` : "";
    prompts.push(
      `## Task\n${task}\n\n## Strategy\n${strategy}${failureBlock}${contextBlock}\n\nImplement the changes needed. Use tools to read files, make edits, and verify your work. Commit when done.`,
    );
  }

  return prompts;
}

// ── Repair prompt ─────────────────────────────────────────────────────

/**
 * Build a repair prompt with structured failure feedback.
 *
 * Includes the original task, the failure output (truncated to 3K chars),
 * and the repair attempt number. Emphasis on targeted fixes, not rewrites.
 */
export function repairPrompt(task: string, failureOutput: string, attemptNum: number, context?: string): string {
  const contextBlock = context ? `\n\n## Context\n${context}` : "";
  return [
    `## Task`,
    task,
    "",
    "## Previous attempt FAILED",
    "Your previous implementation failed verification. Here is the output:",
    "",
    "```",
    failureOutput.slice(0, 3000),
    "```",
    "",
    "## Instructions",
    `This is repair attempt #${attemptNum}. Fix the specific issues shown above.`,
    "Read the relevant files, understand what went wrong, and make targeted fixes.",
    "Do NOT rewrite everything — fix only what's broken.",
    contextBlock,
  ].join("\n");
}

// ── Evolution mutation prompt ─────────────────────────────────────────

/**
 * Build an evolution mutation prompt with elite examples.
 *
 * Includes: current code + its fitness, top-k elite examples with scores,
 * and the optimization goal. Elites provide in-context "gradients" for
 * the mutator to learn from.
 */
export function mutationPrompt(
  goal: string,
  currentCode: string,
  fitnessScore: number,
  elites: { code: string; score: number }[],
  context?: string,
): string {
  const eliteBlock =
    elites.length > 0
      ? [
          "",
          "## Elite mutations (higher score = better)",
          ...elites.map((e, i) => `### Elite #${i + 1} (score=${e.score.toFixed(2)})\n\`\`\`\n${e.code}\n\`\`\``),
        ].join("\n")
      : "";

  const contextBlock = context ? `\n\n## Context\n${context}` : "";

  return [
    `## Goal`,
    goal,
    "",
    `## Current code (fitness = ${fitnessScore.toFixed(2)})`,
    "```",
    currentCode,
    "```",
    eliteBlock,
    "",
    "## Instructions",
    "Mutate this code to improve its fitness score.",
    "Be creative — try different algorithms, data structures, caching, early exits.",
    "Make targeted changes, not rewrites.",
    contextBlock,
  ].join("\n");
}

// ── Judge prompt ──────────────────────────────────────────────────────

/**
 * Build a structured comparison prompt for the LLM judge.
 *
 * Each branch gets its diff (truncated), optional fitness score, and
 * optional verification report. The judge evaluates on 4 dimensions
 * with weighted scoring and returns JSON.
 */
export interface JudgeBranchInput {
  name: string;
  diff: string;
  score?: number;
  verificationReport?: string;
}

export function buildJudgePrompt(branches: JudgeBranchInput[]): string {
  const branchSections = branches
    .map((b, i) => {
      const diff = b.diff.length > 3000 ? `${b.diff.slice(0, 3000)}\n... [truncated]` : b.diff;
      const scoreLine = b.score !== undefined ? `\nFitness score: ${b.score.toFixed(4)}` : "";
      const reportLine = b.verificationReport ? `\nVerification: ${b.verificationReport.slice(0, 500)}` : "";
      return `## Branch ${i + 1}: ${b.name}${scoreLine}${reportLine}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;
    })
    .join("\n\n");

  return [
    "You are an expert code reviewer acting as a judge. Evaluate the following candidate solutions and select the best one.",
    "",
    branchSections,
    "",
    "## Rubric",
    "",
    "Rate each branch on four dimensions (1-10 scale, 10 = best):",
    "",
    "| Dimension       | Weight | Description |",
    "|-----------------|--------|-------------|",
    "| correctness     | 0.4    | Does it solve the problem correctly? No bugs, edge cases handled. |",
    "| clarity         | 0.2    | Is the code readable, well-structured, and easy to understand? |",
    "| efficiency      | 0.2    | Is it performant? Appropriate algorithms, no wasted work. |",
    "| maintainability | 0.2    | Is it modular, testable, and easy to modify? |",
    "",
    "Composite score = correctness x 0.4 + clarity x 0.2 + efficiency x 0.2 + maintainability x 0.2",
    "",
    "## Output Format",
    "",
    "Respond with ONLY a valid JSON object — no markdown fences, no extra text:",
    "",
    "{",
    '  "winner_branch": "<branch name>",',
    '  "scores": {',
    '    "<branch name>": { "correctness": 7, "clarity": 8, "efficiency": 6, "maintainability": 7 }',
    "  },",
    '  "rationale": "Brief explanation of why this branch won."',
    "}",
    "",
    "Be honest and critical. Consider trade-offs carefully. The rationale should be concise but specific.",
  ].join("\n");
}

// ── Feedback compilation prompt ───────────────────────────────────────

/**
 * Build a prompt that asks the model to process and act on structured feedback.
 * Used when the feedback compiler has produced structured diagnostics.
 */
export function feedbackActionPrompt(
  task: string,
  diagnostics: { file: string; line: number; severity: string; message: string; context: string }[],
): string {
  if (diagnostics.length === 0) return repairPrompt(task, "No diagnostics available.", 1);

  const diagBlock = diagnostics
    .slice(0, 10)
    .map(
      (d) =>
        `- **${d.severity}** ${d.file}:${d.line} — ${d.message}${d.context ? `\n  \`\`\`\n${d.context}\n  \`\`\`` : ""}`,
    )
    .join("\n");

  return [
    `## Task`,
    task,
    "",
    "## Structured Feedback",
    "The following issues were detected. Fix each one, focusing on errors first:",
    "",
    diagBlock,
    "",
    "## Instructions",
    "1. Fix errors first, then warnings",
    "2. Read the relevant files to understand context",
    "3. Make targeted fixes — do not rewrite everything",
    "4. After each fix, verify it compiles/passes",
  ].join("\n");
}
