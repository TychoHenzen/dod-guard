export const LANG_BY_EXT = {
  ".ts": "ts",
  ".tsx": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".js": "ts",
  ".jsx": "ts",
  ".mjs": "ts",
  ".cjs": "ts",
  ".cs": "cs",
  ".rs": "rs",
  ".py": "py",
  ".go": "go",
  ".c": "cpp",
  ".java": "java",
  ".kt": "java",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".h": "cpp",
};

export const DEFAULT_THRESHOLDS = {
  "line-length": { warn: 80, error: 120 },
  "file-length": { warn: 100, error: 300 },
  "function-length": { warn: 30, error: 60 },
  complexity: { warn: 5, error: 10 },
  "param-count": { warn: 3, error: 7 },
  "nesting-depth": { warn: 3, error: 5 },
  "types-per-file": { warn: null, error: 1 },
  "duplicate-block": { warn: 1, error: 2 },
  "comment-bloat": { warn: 2, error: 4 },
};

export const PRESENCE_SEVERITY = {
  "else-branch": "warn",
  "unnamed-tuple": "error",
  "dead-export": "error",
  "unused-local": "error",
  "test-only-export": "warn",
  "commented-out-code": "error",
  "comment-restates-code": "warn",
  "todo-marker": "warn",
  "assumption-marker": "warn",
  "stateless-method": "warn",
};

export const DUPLICATE_WINDOW = 6;
