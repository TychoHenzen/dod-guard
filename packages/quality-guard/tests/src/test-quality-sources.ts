import type { Evidence } from "../../src/test-quality/types.js";

export const signalSources = [
  {
    path: "src/service.ts",
    language: "ts",
    behaviors: [
      { id: "ts.behavior", kind: "behavior" },
      { id: "ts.missing", kind: "behavior" },
      { id: "ts.trivial", kind: "behavior", trivial: true },
      {
        id: "ts.boundary",
        kind: "boundary",
        boundary: { input: "empty", expected: "empty-result" },
      },
      { id: "ts.bug", kind: "behavior" },
    ],
  },
  {
    path: "src/parser.py",
    language: "python",
    behaviors: [
      { id: "py.behavior", kind: "behavior" },
      {
        id: "py.boundary",
        kind: "boundary",
        boundary: { input: "-1", expected: "reject" },
      },
    ],
  },
  {
    path: "src/worker.cs",
    language: "csharp",
    behaviors: [{ id: "cs.behavior", kind: "behavior" }],
  },
  {
    path: "src/worker.rs",
    language: "rust",
    behaviors: [{ id: "rs.behavior", kind: "behavior" }],
  },
] satisfies Evidence["sources"];
