import { z } from "zod";
import { behaviorSchema, metricSchema, text } from "./schema-basics.js";

export const sourceSchema = z
  .object({
    path: text,
    language: text,
    behaviors: z.array(behaviorSchema),
  })
  .strict();

export const coverageSchema = z
  .object({
    provider: text,
    observations: z.array(
      z
        .object({
          sourcePath: text,
          statements: metricSchema.optional(),
          branches: metricSchema.optional(),
          functions: metricSchema.optional(),
          lines: metricSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const bugSchema = z
  .object({
    id: text,
    sourcePath: text,
    behaviorIds: z.array(text),
  })
  .strict();

export const failureSchema = z
  .object({
    testId: text,
    sourcePath: text.optional(),
    behaviorId: text.optional(),
    signature: text,
    inputClass: text,
  })
  .strict();

export const timingSchema = z
  .object({
    environment: text,
    budgets: z.array(
      z
        .object({
          testClass: text,
          maxDurationMs: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();
