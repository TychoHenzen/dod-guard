import { z } from "zod";

export const text = z.string().trim().min(1);

export const metricSchema = z
  .object({
    covered: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.covered > value.total)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "covered cannot exceed total",
      });
  });

export const behaviorSchema = z
  .object({
    id: text,
    kind: z.enum(["behavior", "boundary"]),
    trivial: z.boolean().optional(),
    boundary: z.object({ input: text, expected: text }).strict().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "boundary" && !value.boundary)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "boundary behaviors require input and expected evidence",
      });
  });

export const testSchema = z
  .object({
    id: text,
    path: text,
    language: text,
    covers: z.array(text),
    status: z.enum(["passed", "failed", "skipped"]),
    skipReason: z
      .object({
        kind: z.enum([
          "ambiguity",
          "environment",
          "platform",
          "flaky",
          "other",
        ]),
        detail: text,
      })
      .strict()
      .optional(),
    durationMs: z.number().int().nonnegative().optional(),
    testClass: text.default("unit"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "skipped" && !value.skipReason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "skipped tests require skipReason",
      });
  });
