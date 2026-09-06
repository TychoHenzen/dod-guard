import { z } from "zod";
import { relationNames } from "./contract-values.js";

export const semanticRequestSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("search"),
      query: z.string(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("focus"),
      symbol_id: z.string().min(1),
    })
    .strict(),
  ...relationNames.map((operation) =>
    z
      .object({
        operation: z.literal(operation),
        symbol_id: z.string().min(1),
      })
      .strict(),
  ),
]);
