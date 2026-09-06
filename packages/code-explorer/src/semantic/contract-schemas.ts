import { z } from "zod";
import { languages } from "./contract-values.js";

const positionSchema = z
  .object({
    line: z.number().int().nonnegative(),
    character: z.number().int().nonnegative(),
  })
  .strict();
const rangeSchema = z
  .object({ start: positionSchema, end: positionSchema })
  .strict();
const relativePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !(
        path.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(path) ||
        path.split(/[\\/]/).includes("..")
      ),
  );
export const projectLocationSchema = z
  .object({ path: relativePathSchema, range: rangeSchema })
  .strict();
export const externalLocationSchema = z
  .object({ external: z.literal(true) })
  .strict();
export const sourceLocationSchema = z.union([
  projectLocationSchema,
  externalLocationSchema,
]);
export const symbolSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    qualified_name: z.string().min(1).optional(),
    language: z.enum(languages),
    kind: z.string().min(1),
    location: projectLocationSchema,
  })
  .strict();
export const revisionSchema = z
  .object({
    generation: z.number().int().nonnegative(),
    manifest_sha256: z.string().min(1),
  })
  .strict();
