import { z } from "zod";

// ── Shared Zod schemas (reused across tool registrations) ────────────

export const PredicateSchema = z.object({
  type: z.enum([
    "exit_code",
    "exit_code_not",
    "output_contains",
    "output_matches",
    "output_not_contains",
    "output_not_matches",
    "tdd",
    "manual",
    "review",
    "mutation",
    "regression",
    "assertions",
    "streamline",
    "observability",
    "brevity",
    "line_length",
    "function_size",
    "file_size",
    "cohesion",
    "replacement_ratio",
  ]),
  value: z.union([z.number(), z.string()]).optional(),
  extract: z
    .string()
    .optional()
    .describe(
      "regression only: regex whose capture group 1 is the metric number; omit to use the last number in stdout.",
    ),
  lower_is_better: z
    .boolean()
    .optional()
    .describe(
      "regression only: true (default) => smaller is better (perf/complexity/duplication); false => larger is better (coverage).",
    ),
  max_line_length: z.number().optional().describe("brevity / line_length: max characters per line (default 120)."),
  max_function_lines: z.number().optional().describe("brevity / function_size: max lines per function (default 30)."),
  max_file_lines: z.number().optional().describe("brevity / file_size: max lines per file (default 300)."),
  max_complexity: z
    .number()
    .optional()
    .describe("brevity / cohesion: max cyclomatic complexity per function (default 5)."),
  require_guard_clauses: z
    .boolean()
    .optional()
    .describe("brevity / cohesion: flag unnecessary else after exit statement (default true)."),
  suggest_guard_clauses: z
    .boolean()
    .optional()
    .describe(
      "brevity / cohesion: flag if/else pairs in functions lacking guard clauses — advisory suggestion (default true).",
    ),
  min_replacement_ratio: z
    .number()
    .optional()
    .describe("brevity / replacement_ratio: minimum deletion/insertion ratio (default 0.2)."),
  timeout_ms: z
    .number()
    .optional()
    .describe("Override the default 120s command timeout in milliseconds. Use for slow tools like Stryker (600s)."),
});

export const ProofCategorySchema = z.enum([
  "lint",
  "format",
  "tdd",
  "structure",
  "test",
  "mutation",
  "integration_wiring",
  "integration_behavioral",
  "performance",
  "complexity",
  "coverage",
  "duplication",
  "streamline",
  "observability",
  "brevity",
  "regression",
  "manual",
  "other",
]);

// Recursive TaskNode input schema
export const TaskNodeInputSchema: z.ZodType<{
  title: string;
  refinement?: "draft" | "concrete";
  intent?: string;
  children?: {
    title: string;
    refinement?: "draft" | "concrete";
    intent?: string;
    children?: any[];
    command?: string;
    predicate?: any;
    description?: string;
    category?: string;
    advisory?: boolean;
  }[];
  command?: string;
  predicate?: {
    type: string;
    value?: number | string;
    extract?: string;
    lower_is_better?: boolean;
    max_line_length?: number;
    max_function_lines?: number;
    max_file_lines?: number;
    max_complexity?: number;
    require_guard_clauses?: boolean;
    suggest_guard_clauses?: boolean;
    min_replacement_ratio?: number;
    timeout_ms?: number;
  };
  description?: string;
  category?: string;
  advisory?: boolean;
}> = z.lazy(() =>
  z.object({
    title: z.string(),
    refinement: z.enum(["draft", "concrete"]).optional().default("draft"),
    intent: z.string().optional().describe("Required for draft nodes: what behavior this will prove"),
    children: z.array(TaskNodeInputSchema).optional().describe("Subtask decomposition — present on task groups"),
    command: z.string().optional(),
    predicate: PredicateSchema.optional(),
    description: z.string().optional(),
    category: ProofCategorySchema.optional(),
    advisory: z.boolean().optional(),
  }),
);

export const SectionsSchema = z.object({
  decisions: z.string().optional(),
  current_state: z.string().optional(),
  requirements: z.string(),
  research_notes: z.string().optional(),
  open_questions: z.string().optional(),
  open_risks: z.string().optional(),
});
