import { z } from "zod";

export const PATHS = z
  .array(z.string())
  .min(1)
  .describe("Paths to scan, relative to root");
export const ROOT = z
  .string()
  .optional()
  .describe(
    "Repository root. Point this at the repo, not at the target, so manifest " +
      "files are in scope",
  );
export const EXCLUDES = z
  .array(z.string())
  .optional()
  .describe("Skip paths containing these fragments");
export const TEST_PATHS = z
  .array(z.string())
  .optional()
  .describe("Treat paths containing these fragments as test code");
