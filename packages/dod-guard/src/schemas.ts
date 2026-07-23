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
    "adversarial",
    "holdout",
    "convergence",
  ]),
  value: z.union([z.number(), z.string()]).optional(),
  timeout_ms: z
    .number()
    .optional()
    .describe("Override the default 120s command timeout in milliseconds. Use for slow tools like Stryker (600s)."),
});

export const ProofCategorySchema = z.enum(["behavioral", "wiring", "manual", "other", "test_audit"]);

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
