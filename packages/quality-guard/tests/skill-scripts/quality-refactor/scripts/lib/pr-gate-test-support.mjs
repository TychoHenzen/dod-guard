import { classifyChanges } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-compare.mjs";

/** A scanner finding; every field can be overridden. */
export const finding = (overrides = {}) => ({
  file: "a.cs",
  line: 1,
  rule: "line-length",
  severity: "medium",
  message: "line is 130 chars",
  metric: 130,
  ...overrides,
});

export const modified = (path) => ({ path, basePath: path });

/** Classify findings for one modified file (a.cs) unless `files` says otherwise. */
export const classify = (head, base, files = [modified("a.cs")]) =>
  classifyChanges({ files, head, base });
