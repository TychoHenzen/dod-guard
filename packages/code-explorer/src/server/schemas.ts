import { z } from "zod";
import { browserRelationNames } from "../navigation/focus-relation-names.js";

export const schemas = {
  code_search: z
    .object({
      query: z.string(),
      path_globs: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      kinds: z.array(z.string()).optional(),
      content: z.enum(["all", "production", "tests"]).optional(),
      include_generated: z.boolean().optional(),
      limit: z.number().int().optional(),
    })
    .strict(),
  code_focus: z
    .object({
      session_id: z.string(),
      request_id: z.string(),
      symbol_id: z.string(),
      body_limit_bytes: z.number().int().optional(),
    })
    .strict(),
  code_follow: z
    .object({
      session_id: z.string(),
      request_id: z.string(),
      view_id: z.string(),
      handle: z.string(),
      relation: z.enum(browserRelationNames),
      limit: z.number().int().optional(),
    })
    .strict(),
  code_history: z.union([
    z
      .object({
        session_id: z.string(),
        request_id: z.string(),
        action: z.enum(["back", "forward"]),
      })
      .strict(),
    z
      .object({
        session_id: z.string(),
        request_id: z.string(),
        action: z.literal("recent"),
        limit: z.number().int().optional(),
      })
      .strict(),
  ]),
  code_status: z.union([
    z.object({ action: z.enum(["status", "start_session"]) }).strict(),
    z
      .object({
        action: z.literal("refresh"),
        session_id: z.string(),
        request_id: z.string(),
      })
      .strict(),
  ]),
} as const;
