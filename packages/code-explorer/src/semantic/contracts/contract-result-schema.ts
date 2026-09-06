import { z } from "zod";
import {
  externalLocationSchema,
  projectLocationSchema,
  revisionSchema,
  sourceLocationSchema,
  symbolSchema,
} from "./contract-schemas.js";
import { relationNames } from "./contract-values.js";

const visibleSymbolSchema = z
  .object({
    name: z.string().min(1),
    symbol_id: z.string().min(1),
  })
  .strict();
const focusContentSchema = z
  .object({
    body: z.string().optional(),
    declaration: z.string().optional(),
    visible_symbols: z.array(visibleSymbolSchema).optional(),
  })
  .strict()
  .optional();

function relationSchema(operation: (typeof relationNames)[number]) {
  return z
    .object({
      operation: z.literal(operation),
      revision: revisionSchema,
      relations: z.array(
        z.union([
          z
            .object({
              relation: z.literal(operation),
              symbol: symbolSchema,
              location: sourceLocationSchema,
              call_site: projectLocationSchema.optional(),
            })
            .strict(),
          z
            .object({
              relation: z.literal(operation),
              external: externalLocationSchema.extend({
                display_name: z.string().min(1).optional(),
              }),
            })
            .strict(),
        ]),
      ),
    })
    .strict();
}

export const semanticResultSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("search"),
      revision: revisionSchema,
      symbols: z.array(symbolSchema),
    })
    .strict(),
  z
    .object({
      operation: z.literal("focus"),
      revision: revisionSchema,
      symbol: symbolSchema,
      content: focusContentSchema,
    })
    .strict(),
  ...relationNames.map(relationSchema),
]);
