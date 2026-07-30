// Thresholds, language mapping, and ignore lists for quality-scan.

/** Extension -> language family used by the parser and rule set. */
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
  ".java": "java",
  ".kt": "java",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".h": "cpp",
};

/**
 * Non-code files that can still connect a symbol. A hit in one of these counts
 * as production usage evidence in `referenceCounts`, even though the file
 * itself is never parsed or scanned for violations.
 *
 * Every entry has to be a file a human connects on purpose. That means a scene
 * graph, a project file, or a template that names the component it renders.
 *
 * Generic data formats stay out, for the same reason `.md` stays out. A file
 * that merely contains a symbol name is not usage. Worse, `.json` and its
 * relatives are the shape most build artifacts, caches and audit reports take.
 * Those files are usually gitignored, so counting them made the verdict differ
 * between a developer machine and CI. A `dead-export` that a local test-report
 * JSON silenced is exactly the dead code this rule exists to find.
 */
export const MANIFEST_EXTS = new Set([
  ".tscn",
  ".tres",
  ".godot",
  ".gd",
  ".gdshader",
  ".csproj",
  ".fsproj",
  ".vbproj",
  ".sln",
  ".gradle",
  ".razor",
  ".cshtml",
  ".vue",
  ".svelte",
  ".plist",
  ".storyboard",
  ".xib",
]);

/** Directories never worth scanning. */
export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  "vendor",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".step-session",
  ".quality",
]);

/** Files that are generated, vendored, or otherwise not hand-written. */
export const IGNORED_FILE_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.d\.ts$/,
  /\.generated\./,
  /\.designer\.cs$/i,
  /_pb2?\.py$/,
  /\.pb\.go$/,
];

/** Paths matching these are treated as tests, not production code. */
const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /(^|[\\/])tests?[\\/]/i,
  /(^|[\\/])__tests__[\\/]/,
  /_test\.(go|py|rs)$/,
  /Tests?\.cs$/,
  /(^|[\\/])(testing|fixtures|harness|mocks|stubs)[\\/]/i,
];

/**
 * Files whose exported symbols are entry points — an export with no
 * in-repo callers is expected there, so dead-export never fires on them.
 */
const ENTRY_PATTERNS = [
  /(^|[\\/])(index|main|mod|lib|cli|program|app|server|setup|conftest)\.[\w]+$/i,
  /(^|[\\/])__init__\.py$/,
];

/**
 * Rule thresholds. `warn` and `error` are upper bounds — a metric strictly
 * greater than the bound raises that severity. `null` disables the level.
 */
const DEFAULT_THRESHOLDS = {
  "line-length": { warn: 80, error: 120 },
  "file-length": { warn: 100, error: 300 },
  "function-length": { warn: 30, error: 60 },
  complexity: { warn: 5, error: 10 },
  "param-count": { warn: 3, error: 7 },
  "nesting-depth": { warn: 3, error: 5 },
  "types-per-file": { warn: null, error: 1 },
  "duplicate-block": { warn: 1, error: 2 },
};

/** Rules that fire on presence, not on a numeric threshold. */
const PRESENCE_SEVERITY = {
  "else-branch": "warn",
  "unnamed-tuple": "error",
  "dead-export": "error",
  "unused-local": "error",
  "test-only-export": "warn",
  "commented-out-code": "error",
  "todo-marker": "warn",
  "stateless-method": "warn",
};

/** Minimum consecutive normalized lines that count as a duplicate block. */
export const DUPLICATE_WINDOW = 6;

export const ALL_RULES = [...Object.keys(DEFAULT_THRESHOLDS), ...Object.keys(PRESENCE_SEVERITY)];

/**
 * Build the active config. `strict` collapses the preferred bound onto the
 * hard bound, so "preferably under 5" becomes "under 5, no argument".
 */
export function buildConfig(profile) {
  const thresholds = structuredClone(DEFAULT_THRESHOLDS);
  const presence = { ...PRESENCE_SEVERITY };
  if (profile === "strict") {
    for (const rule of Object.keys(thresholds)) {
      const { warn } = thresholds[rule];
      if (warn !== null) thresholds[rule] = { warn: null, error: warn };
    }
    for (const rule of Object.keys(presence)) presence[rule] = "error";
  }
  return { profile, thresholds, presence };
}

/** Severity for a numeric metric, or null when the metric is within bounds. */
export function severityFor(config, rule, value) {
  const bounds = config.thresholds[rule];
  if (!bounds) return null;
  if (bounds.error !== null && value > bounds.error) return "error";
  if (bounds.warn !== null && value > bounds.warn) return "warn";
  return null;
}

/**
 * `extraFragments` are repo-declared test-support path fragments (from
 * `--test-path`), matched as a plain substring against the relative path, on
 * top of the built-in patterns. Callers that pass none get the built-in
 * behavior unchanged.
 */
export function isTestPath(relPath, extraFragments = []) {
  if (TEST_PATTERNS.some((re) => re.test(relPath))) return true;
  return extraFragments.some((fragment) => relPath.includes(fragment));
}

export function isEntryPath(relPath) {
  return ENTRY_PATTERNS.some((re) => re.test(relPath));
}
