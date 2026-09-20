import { z } from "zod";
import { testSchema, text } from "./schema-basics.js";
import {
  bugSchema,
  coverageSchema,
  failureSchema,
  sourceSchema,
  timingSchema,
} from "./schema-parts.js";

export const EvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: text.optional(),
    sources: z.array(sourceSchema),
    tests: z.array(testSchema),
    coverage: coverageSchema.optional(),
    bugs: z.array(bugSchema).optional(),
    failures: z.array(failureSchema).optional(),
    timing: timingSchema.optional(),
  })
  .strict();
