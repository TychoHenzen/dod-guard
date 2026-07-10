import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";

/**
 * Objective test-metric extraction for scoring formulas.
 *
 * Extracts EVERYTHING regex can detect from test files, returning raw counts.
 * Fields marked `needs_llm` are booleans/counts where regex can't fully classify
 * — the LLM fills these, and the scoring formula uses merged data.
 *
 * Language support: JS/TS, Python, Rust, C#, Go.
 * Pattern: same as brevity.ts / observability.ts / assertions.ts.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface TestFn {
  name: string;
  line: number;
  isSkipped: boolean;
}

export interface TestFileMetrics {
  file: string;
  lineCount: number;

  // Test function detection
  testFunctions: TestFn[];
  testFunctionCount: number;

  // Assertion metrics
  totalAssertions: number;
  trivialAssertions: number;
  truthinessAssertions: number;   // assert(x), toBeDefined(), IsNotNull() etc
  specificAssertions: number;       // total - trivial - truthiness (or regex-classified)
  zeroAssertionFunctions: number;   // test funcs with no assertion line
  assertionsWithMessage: number;
  assertionsWithoutMessage: number;

  // Determinism anti-patterns (boolean flags)
  hasRealTime: boolean;
  hasUnseededRandom: boolean;
  hasSleep: boolean;
  hasRealFilesystem: boolean;
  hasRealNetwork: boolean;
  hasRealDatabase: boolean;
  hasSharedMutableState: boolean;

  // Isolation metrics
  hasSetupTeardown: boolean;        // beforeEach/afterEach or equivalent present
  moduleMutableCount: number;
  hasTestOnly: boolean;
  createsOwnFixtures: boolean | null;   // null = needs LLM

  // Clarity metrics
  genericNames: string[];
  hasAaaMarkers: boolean;
  magicNumberCount: number;
  multiBehaviorCount: number | null;    // null = needs LLM

  // Speed metrics
  sleepWaitCount: number;
  realIoCount: number;                  // fs/network/DB calls

  // Coverage depth (partial — LLM fills the rest)
  errorPathFunctions: number;           // tests expecting throws/errors
  happyPathFunctions: number | null;    // null = needs LLM
  edgeCaseFunctions: number | null;     // null = needs LLM

  // Diagnostics
  frameworkShowsDiff: boolean;
  hasCustomMatchers: boolean | null;     // null = needs LLM

  // LLM hints
  llm_classifications_needed: string[];
}

export interface TestMetricsReport {
  files: string[];
  perFile: TestFileMetrics[];
}

// ── Language detection ───────────────────────────────────────────────────

type Language = "js" | "py" | "rs" | "cs" | "go" | null;

function detectLanguage(file: string): Language {
  const ext = path.extname(file).toLowerCase();
  if ([".js", ".ts", ".mjs", ".cjs", ".mts", ".cts", ".jsx", ".tsx"].includes(ext)) return "js";
  if (ext === ".py") return "py";
  if (ext === ".rs") return "rs";
  if (ext === ".cs") return "cs";
  if (ext === ".go") return "go";
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function stripComments(line: string, lang: Language): string {
  if (lang === "py" || lang === "rs" || lang === "go") return line.replace(/#.*$/, "").replace(/\/\/.*$/, "");
  return line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
}

// ── Test function detection ──────────────────────────────────────────────

const JS_TEST_FN = [
  /\b(?:test|it)\s*\(\s*["'`]([^"'`]+)["'`]/,
  /(?:(?:test|it)\s*\(\s*["'`][^"'`]*["'`]\s*,?\s*(?:async\s*)?\s*(?:function\s*)?\([^)]*\)\s*\{?)/,
];
const JS_TEST_BODY: RegExp[] = JS_TEST_FN;
const JS_SKIP = /\b(?:test|it)\.skip\b/;

const PY_TEST_FN = /^\s*def\s+(test\w+)\s*\(/;
const PY_SKIP = /@pytest\.mark\.skip|@unittest\.skip|@skip/;

const RS_TEST_FN = /#\[test\]|#\[tokio::test/;
const RS_FN_NAME = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/;
const RS_SKIP = /#\[ignore\]/;

const CS_TEST_FN = /\[TestMethod\]|\[Fact\]|\[Theory\]/;
const CS_FN_NAME = /^\s*(?:public|private|protected|internal|static|async|virtual|override)\s+\w+\s+(\w+)\s*\(/;
const CS_SKIP = /\[Ignore\]/;

const GO_TEST_FN = /^func\s+(Test\w+)\s*\(/;
const GO_SKIP = /t\.Skip\(\)/;

function detectTestFunctions(lines: string[], lang: Language): TestFn[] {
  if (!lang) return [];
  const fns: TestFn[] = [];

  switch (lang) {
    case "js": {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/\b(test|it)\s*\(\s*["'`]([^"'`]+)["'`]/);
        if (m) {
          fns.push({ name: m[2], line: i + 1, isSkipped: JS_SKIP.test(line) });
        }
      }
      break;
    }
    case "py": {
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(PY_TEST_FN);
        if (m) {
          fns.push({ name: m[1], line: i + 1, isSkipped: false });
        }
      }
      // Check for skip decorators on previous lines
      for (let i = 0; i < fns.length; i++) {
        const fnLine = fns[i].line - 1;
        for (let j = fnLine - 1; j >= 0 && j >= fnLine - 3; j--) {
          if (PY_SKIP.test(lines[j])) { fns[i].isSkipped = true; break; }
        }
      }
      break;
    }
    case "rs": {
      for (let i = 0; i < lines.length; i++) {
        if (RS_TEST_FN.test(lines[i])) {
          // Find the fn declaration on this line or next few
          let fnLine = i;
          let m: RegExpMatchArray | null = null;
          for (let j = i; j < Math.min(lines.length, i + 3); j++) {
            m = lines[j].match(RS_FN_NAME);
            if (m) { fnLine = j; break; }
          }
          const isSkipped = RS_SKIP.test(lines[i]);
          if (m) {
            fns.push({ name: m[1], line: fnLine + 1, isSkipped });
          }
          i = fnLine;
        }
      }
      break;
    }
    case "cs": {
      for (let i = 0; i < lines.length; i++) {
        if (CS_TEST_FN.test(lines[i])) {
          // Find the method declaration
          for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
            const m = lines[j].match(CS_FN_NAME);
            if (m) {
              const isSkipped = CS_SKIP.test(lines[i]);
              fns.push({ name: m[1], line: j + 1, isSkipped });
              i = j;
              break;
            }
          }
        }
      }
      break;
    }
    case "go": {
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(GO_TEST_FN);
        if (m) {
          fns.push({ name: m[1], line: i + 1, isSkipped: false });
        }
      }
      break;
    }
  }

  return fns;
}

// ── Assertion detection ──────────────────────────────────────────────────

// Broad assertion detectors
const ASSERT_DETECTORS: Record<string, RegExp> = {
  js: /(?:expect\s*\(|assert\.|assert\s*\(|\.to(?:Be|Equal|Contain|Match|Throw|Have))/,
  py: /(?:^\s*assert\b|self\.assert)/,
  rs: /(?:assert!|assert_eq!|assert_ne!)/,
  cs: /(?:Assert\.|\.Should\(|Shouldly)/,
  go: /(?:assert\.|require\.|if\s+.+\s*!=\s*.+\s*\{?\s*t\.(?:Error|Fatal))/,
};

// Truthiness assertion patterns — single-argument existence/boolean checks
const TRUTHINESS_PATTERNS: Record<string, RegExp[]> = {
  js: [
    /\.toBeDefined\s*\(\s*\)/,
    /\.toBeUndefined\s*\(\s*\)/,
    /\.toBeTruthy\s*\(\s*\)/,
    /\.toBeFalsy\s*\(\s*\)/,
    /\.toBeNull\s*\(\s*\)/,
    /assert\s*\(\s*\w+\s*\)/,
    /assert\.ok\s*\(/,
    /assert\.isOk\s*\(/,
    /\.not\.toBeNull\s*\(\s*\)/,
  ],
  py: [
    /^\s*assert\s+\w+\s*$/,
    /^\s*assert\s+\w+\s+is\s+not\s+None/,
    /^\s*assert\s+\w+\s+is\s+None/,
    /self\.assertTrue\s*\(\s*\w+\s*\)/,
    /self\.assertFalse\s*\(\s*\w+\s*\)/,
    /self\.assertIsNotNone\s*\(/,
    /self\.assertIsNone\s*\(/,
  ],
  rs: [
    /assert!\s*\(\s*\w+\s*\)/,      // bare assert!(x) — no method call on x
    /assert!\s*\(\s*!\s*\w+\s*\)/, // assert!(!x)
  ],
  cs: [
    /Assert\.IsTrue\s*\(/,
    /Assert\.IsFalse\s*\(/,
    /Assert\.IsNotNull\s*\(/,
    /Assert\.IsNull\s*\(/,
    /Assert\.That\s*\(\s*\w+\s*,\s*Is\.True/,
    /\.Should\(\s*\)\.BeTrue/,
  ],
  go: [
    /assert\.True\s*\(/,
    /assert\.False\s*\(/,
    /assert\.NotNil\s*\(/,
    /assert\.Nil\s*\(/,
    /require\.True\s*\(/,
    /assert\.Empty\s*\(/,
    /assert\.NotEmpty\s*\(/,
  ],
};

// Trivial assertion patterns — constant-on-constant (reuse assertions.ts patterns)
const TRIVIAL_PATTERNS: Record<string, RegExp[]> = {
  js: [
    /expect\s*\(\s*(?:true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*\)\s*\.\s*(?:not\s*\.\s*)?(?:toBe|toEqual|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|toStrictEqual|toMatchObject|toContain|toHaveLength)\s*\(\s*(?:true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*\)/,
    /assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|notDeepEqual)\s*\(\s*(?:true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*,\s*(?:true|false|null|undefined|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*\)/,
    /assert\.(?:ok|fail)\s*\(\s*(?:true|false)\s*\)/,
  ],
  py: [
    /^\s*assert\s+(?:True|False|None)\s*(?:#.*)?$/,
    /^\s*assert\s+(?:True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(?:#.*)?$/,
    /^\s*assert\s+(?:True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(?:==|!=|is|is\s+not|in|not\s+in|[<>]=?)\s*(?:True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(?:#.*)?$/,
    /self\.assert(?:True|False|Equal|NotEqual|Is|IsNot|In|NotIn|Greater|Less|AlmostEqual|Regex|Raises)\s*\(\s*(?:True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*(?:,\s*(?:True|False|None|\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*)?\)/,
  ],
  rs: [
    /assert!\s*\(\s*(?:true|false)\s*\)/,
    /assert_eq!\s*\(\s*(?:\d+(?:\.\d+)?|true|false)\s*,\s*(?:\d+(?:\.\d+)?|true|false)\s*\)/,
    /assert_ne!\s*\(\s*(?:\d+(?:\.\d+)?)\s*,\s*(?:\d+(?:\.\d+)?)\s*\)/,
  ],
  cs: [
    /Assert\.IsTrue\s*\(\s*(?:true|false)\s*\)/,
    /Assert\.AreEqual\s*\(\s*(?:\d+(?:\.\d+)?)\s*,\s*(?:\d+(?:\.\d+)?)\s*\)/,
  ],
  go: [
    /assert\.Equal\s*\(\s*t\s*,\s*(?:\d+(?:\.\d+)?)\s*,\s*(?:\d+(?:\.\d+)?)\s*\)/,
    /assert\.True\s*\(\s*t\s*,\s*(?:true|false)\s*\)/,
    /require\.Equal\s*\(\s*t\s*,\s*(?:\d+(?:\.\d+)?)\s*,\s*(?:\d+(?:\.\d+)?)\s*\)/,
  ],
};

// Assertion message detection — second-to-last or last argument is a string
const MESSAGE_PATTERNS: Record<string, RegExp> = {
  // JS: assert.equal(a, b, "msg") or expect(x).toBe(y, "msg") or assert.ok(x, "msg")
  js: /\b(?:assert\.\w+|expect\s*\([^)]+\)\s*\.\s*\w+)\s*\([^)]*,\s*["'`][^"'`]+["'`]\s*\)/,
  py: /\b(?:self\.)?assert\w*\s*\([^)]*,\s*(?:msg|message)=?['"]/,
  rs: /assert(?:_eq|_ne|!)?\s*\([^)]*,\s*"[^"]*"\s*\)/,
  cs: /Assert\.\w+\s*\([^)]*,\s*"[^"]*"/,
  go: /assert\.\w+\s*\(\s*t\s*,[^,]*,[^,]*,\s*"[^"]*"/,
};

function countAssertions(lines: string[], lang: Language): {
  total: number; trivial: number; truthiness: number; specific: number;
  messaged: number; unmessaged: number;
} {
  if (!lang) return { total: 0, trivial: 0, truthiness: 0, specific: 0, messaged: 0, unmessaged: 0 };
  const detector = ASSERT_DETECTORS[lang];
  const truthinessRes = TRUTHINESS_PATTERNS[lang] || [];
  const trivialRes = TRIVIAL_PATTERNS[lang] || [];
  const messageRe = MESSAGE_PATTERNS[lang];
  const trivialResFull = [...trivialRes, ...truthinessRes]; // truthiness assertions are non-trivial but also not "just constants"

  let total = 0, trivial = 0, truthiness = 0, messaged = 0;

  for (const line of lines) {
    const stripped = stripComments(line, lang);
    // Count assertion occurrences on this line
    const globalDetector = new RegExp(detector.source, "g");
    const matches = stripped.match(globalDetector);
    if (!matches) continue;
    const lineCount = matches.length;
    total += lineCount;

    // Check trivial (constant-on-constant, highest priority — includes some truthiness overlap)
    const isTrivial = trivialRes.some((p) => p.test(stripped));
    if (isTrivial) { trivial += lineCount; continue; }

    // Check truthiness (existence/boolean check without value comparison)
    const isTruthiness = truthinessRes.some((p) => p.test(stripped));
    if (isTruthiness) { truthiness += lineCount; }

    // Check message
    if (messageRe && messageRe.test(stripped)) messaged += lineCount;
  }

  const specific = total - trivial - truthiness;
  const unmessaged = total - messaged;

  return { total, trivial, truthiness, specific, messaged, unmessaged };
}

function detectZeroAssertionFunctions(fns: TestFn[], lines: string[], lang: Language): number {
  if (!lang || fns.length === 0) return 0;
  const detector = ASSERT_DETECTORS[lang];
  if (!detector) return 0;

  let zero = 0;
  // For each test function, check its body for any assertion
  for (let fi = 0; fi < fns.length; fi++) {
    const fnStart = fns[fi].line - 1; // 0-indexed
    // Find the function body end (next test function or EOF)
    const fnEnd = fi < fns.length - 1 ? fns[fi + 1].line - 1 : lines.length;
    let hasAssertion = false;
    for (let i = fnStart; i < Math.min(fnEnd, lines.length); i++) {
      if (detector.test(stripComments(lines[i], lang))) { hasAssertion = true; break; }
    }
    if (!hasAssertion) zero++;
  }
  return zero;
}

// ── Determinism detection ────────────────────────────────────────────────

const REAL_TIME_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bDate\.now\s*\(/, /\bnew\s+Date\s*\(/, /\bperformance\.now\s*\(/],
  py: [/\bdatetime\.now\s*\(/, /\btime\.time\s*\(/],
  rs: [/\bInstant::now\s*\(/, /\bSystemTime::now\s*\(/],
  cs: [/\bDateTime\.Now/, /\bDateTimeOffset\.Now/, /\bDateTime\.UtcNow/],
  go: [/\btime\.Now\s*\(/],
};

const RANDOM_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bMath\.random\s*\(/],
  py: [/\brandom\.(?:random|randint|choice|uniform)\s*\(/],
  rs: [/\brand::(?:random|thread_rng)\s*\(/],
  cs: [/\bnew\s+Random\s*\(/, /\bRandom\.Shared/],
  go: [/\brand\.(?:Int|Float|Intn|Float64)\s*\(/],
};

const SLEEP_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bsetTimeout\s*\(/, /\bsetInterval\s*\(/, /\bnew\s+Promise\s*\(\s*(?:function\s*)?\s*resolve\s*=>\s*setTimeout/],
  py: [/\btime\.sleep\s*\(/, /\basyncio\.sleep\s*\(/],
  rs: [/\bstd::thread::sleep\s*\(/, /\btokio::time::sleep\s*\(/],
  cs: [/\bThread\.Sleep\s*\(/, /\bTask\.Delay\s*\(/],
  go: [/\btime\.Sleep\s*\(/],
};

const FILESYSTEM_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bfs\.readFile/, /\bfs\.writeFile/, /\bfs\.mkdir/, /\bfs\.unlink/, /\bfs\.existsSync/],
  py: [/\bopen\s*\([^)]*['"][rw]/, /\bPath\s*\([^)]*\)\.(?:read|write)/, /\bos\.(?:remove|mkdir|listdir)/],
  rs: [/\bstd::fs::(?:read|write|create|remove)/, /\bFile::(?:open|create)/],
  cs: [/\bFile\.(?:Read|Write|Open|Create|Delete|Exists)\s*\(/],
  go: [/\bos\.(?:Open|Create|Remove|Mkdir|ReadFile|WriteFile)\s*\(/],
};

const NETWORK_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bfetch\s*\(/, /\baxios\./, /\bsuperagent/, /\bhttp\.(?:get|post|request)\s*\(/],
  py: [/\brequests\.(?:get|post|put|delete|patch)\s*\(/, /\burllib\./],
  rs: [/\breqwest::/, /\bureq::/, /\bhyper::/],
  cs: [/\bHttpClient\b/, /\bWebRequest\.Create/, /\bRestClient/],
  go: [/\bhttp\.(?:Get|Post|Do)\s*\(/, /\bhttp\.NewRequest/],
};

const DATABASE_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bsequelize/, /\bprisma\./, /\bmongoose/, /\bpg\b/, /\bmysql/, /\bsqlite/, /\bknex/],
  py: [/\bsqlalchemy/, /\bDjango\.db/, /\bpsycopg/, /\bsqlite3/],
  rs: [/\bdiesel::/, /\bsqlx::/, /\brusqlite/],
  cs: [/\bSqlConnection/, /\bDbContext/, /\bSqlCommand/, /\bNpgsql/],
  go: [/\b(sql\.DB|sql\.Open|gorm\.|pgx\.)/],
};

// Mock library detection — if present, most real-time/network/DB calls are likely mocked
const MOCK_LIB_PATTERNS: Record<string, RegExp> = {
  js: /\bjest\.(?:fn|mock|spyOn)\b|\bvi\.(?:fn|mock|spyOn)\b|\bsinon\.|\bproxyquire\b|mock\.module\s*\(/,
  py: /\b(?:mock|unittest\.mock|pytest\.fixture|mocker\.patch|monkeypatch)\b/,
  rs: /\bmockall|mock!\s*\{|#\[mock\]/,
  cs: /\bMoq\b|\bNSubstitute\b|\bFakeItEasy\b/,
  go: /\bgomock\b|\btestify\/mock\b/,
};

function hasPattern(lines: string[], patterns: RegExp[]): boolean {
  for (const line of lines) {
    for (const p of patterns) {
      if (p.test(stripComments(line, null))) return true;
    }
  }
  return false;
}

function countPattern(lines: string[], patterns: RegExp[]): number {
  let count = 0;
  for (const line of lines) {
    for (const p of patterns) {
      const global = new RegExp(p.source, "g");
      const m = line.match(global);
      if (m) count += m.length;
    }
  }
  return count;
}

function detectDeterminism(lines: string[], lang: Language): {
  hasRealTime: boolean;
  hasUnseededRandom: boolean;
  hasSleep: boolean;
  hasRealFilesystem: boolean;
  hasRealNetwork: boolean;
  hasRealDatabase: boolean;
  hasSharedMutableState: boolean;
} {
  if (!lang) return { hasRealTime: false, hasUnseededRandom: false, hasSleep: false, hasRealFilesystem: false, hasRealNetwork: false, hasRealDatabase: false, hasSharedMutableState: false };

  const mockLibRe = MOCK_LIB_PATTERNS[lang];
  const hasMockLib = mockLibRe ? mockLibRe.test(lines.join("\n")) : false;

  return {
    hasRealTime: hasPattern(lines, REAL_TIME_PATTERNS[lang] || []) && !hasMockLib,
    hasUnseededRandom: hasPattern(lines, RANDOM_PATTERNS[lang] || []) && !hasMockLib,
    hasSleep: hasPattern(lines, SLEEP_PATTERNS[lang] || []),
    hasRealFilesystem: hasPattern(lines, FILESYSTEM_PATTERNS[lang] || []) && !hasMockLib,
    hasRealNetwork: hasPattern(lines, NETWORK_PATTERNS[lang] || []) && !hasMockLib,
    hasRealDatabase: hasPattern(lines, DATABASE_PATTERNS[lang] || []) && !hasMockLib,
    hasSharedMutableState: detectModuleMutableVars(lines, lang) > 0,
  };
}

// ── Module-level mutable state detection ─────────────────────────────────

function detectModuleMutableVars(lines: string[], lang: Language): number {
  if (!lang) return 0;
  let count = 0;

  // Track whether we're past all import/use statements
  let inPreamble = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("#")) continue;

    // Detect end of preamble
    if (lang === "js" && /^(?:import|const\s+.*=.*require|export\s+type)/.test(trimmed)) continue;
    if (lang === "py" && /^(?:import|from)\s/.test(trimmed)) continue;
    if (lang === "rs" && /^(?:use|mod|extern\s+crate)/.test(trimmed)) continue;
    if (lang === "cs" && /^using\s/.test(trimmed)) continue;
    if (lang === "go" && /^(?:package|import)\s/.test(trimmed)) continue;
    inPreamble = false;
    if (inPreamble) continue;

    // Module-level mutable declarations
    if (lang === "js") {
      if (/^\s*(?:let|var)\s+\w+/.test(line) && !/^\s*(?:let|var)\s+\w+\s*=\s*(?:require|import)\s*\(/.test(line)) count++;
    } else if (lang === "py") {
      if (/^\w+\s*=\s*[^=]/.test(trimmed) && getIndent(line) === 0) count++;
    } else if (lang === "rs") {
      if (/^\s*static\s+mut\b/.test(line)) count++;
    } else if (lang === "cs") {
      if (/^\s*(?:public|private|protected|internal|static)\s+\w+\s+\w+\s*=\s*/.test(line)) count++;
      if (/^\s*(?:public|private|protected|internal)\s+static\s+\w+\s+\w+/.test(line)) count++;
    } else if (lang === "go") {
      if (/^\s*var\s+\w+\s+/.test(line) && !inPreamble) count++;
    }
  }

  return count;
}

// ── Isolation detection ──────────────────────────────────────────────────

function detectIsolation(lines: string[], lang: Language, fns: TestFn[]): {
  hasSetupTeardown: boolean;
  moduleMutableCount: number;
  hasTestOnly: boolean;
} {
  if (!lang) return { hasSetupTeardown: false, moduleMutableCount: 0, hasTestOnly: false };

  // Setup/teardown detection
  let hasSetupTeardown = false;
  switch (lang) {
    case "js":
      hasSetupTeardown = /\b(?:beforeEach|afterEach|beforeAll|afterAll)\s*\(/.test(lines.join("\n"));
      break;
    case "py":
      hasSetupTeardown = /def\s+(?:setUp|tearDown|setup_method|teardown_method)\s*\(/.test(lines.join("\n")) ||
        /@pytest\.fixture/.test(lines.join("\n"));
      break;
    case "rs":
      // Rust tests typically create fixtures inline; setup is per-test by convention
      hasSetupTeardown = true; // Rust tests are inherently isolated
      break;
    case "cs":
      hasSetupTeardown = /\[(?:TestInitialize|TestCleanup|SetUp|TearDown)\]/.test(lines.join("\n"));
      break;
    case "go":
      hasSetupTeardown = /\bfunc\s+(?:setup|teardown|TestMain)\s*\(/.test(lines.join("\n"));
      break;
  }

  // test.only / skip detection
  let hasTestOnly = false;
  switch (lang) {
    case "js": hasTestOnly = /\b(?:test|it)\.only\b/.test(lines.join("\n")); break;
    case "py": hasTestOnly = /@pytest\.mark\.skip/.test(lines.join("\n")); break;
    case "rs": hasTestOnly = /#\[ignore\]/.test(lines.join("\n")); break;
    case "cs": hasTestOnly = /\[Ignore\]/.test(lines.join("\n")); break;
    case "go": hasTestOnly = /\bt\.Skip\s*\(/.test(lines.join("\n")); break;
  }

  return {
    hasSetupTeardown,
    moduleMutableCount: detectModuleMutableVars(lines, lang),
    hasTestOnly,
  };
}

// ── Clarity detection ────────────────────────────────────────────────────

const GENERIC_NAME_PATTERNS: RegExp[] = [
  /^(?:test|it)\s*\(\s*["'`](?:test|works|test1|test2|test_?\d+|foo|bar|baz|basic|simple|unit|check|run|test[A-Z]|it works)["'`]/,
  /^def\s+(?:test_?\d+|test_basic|test_simple|test_works|test_foo)\s*\(/,
  /^func\s+(?:Test\w{0,3}|TestMethod)\s*\(/,
  /\[TestMethod\]\s*\n\s*public\s+\w+\s+(?:Test\w{0,3}|TestMethod)\s*\(/,
];

function detectClarity(lines: string[], lang: Language, fns: TestFn[]): {
  genericNames: string[];
  hasAaaMarkers: boolean;
  magicNumberCount: number;
} {
  const genericNames = fns.filter(f => {
    return GENERIC_NAME_PATTERNS.some(p => {
      // Search for the function name in the lines
      for (const line of lines) {
        if (line.includes(f.name) && p.test(line)) return true;
      }
      return false;
    });
  }).map(f => f.name);

  const combined = lines.join("\n");

  const hasAaaMarkers = /\/\/\s*(?:Arrange|Act|Assert)\b|#\s*(?:Arrange|Act|Assert)\b|--\s*(?:Arrange|Act|Assert)\b/.test(combined);

  // Magic numbers in assertions (bare literals > 1 that aren't 0, 1, -1, true, false, null)
  let magicCount = 0;
  const magicRe = /assert\w*\s*\(\s*\w+\s*,\s*(\d+)\s*\)/g;
  for (const line of lines) {
    let m: RegExpExecArray | null;
    while ((m = magicRe.exec(line)) !== null) {
      const val = parseInt(m[1], 10);
      if (val > 1 && val !== 42 && val !== 100 && val !== 200 && val !== 404 && val !== 500) {
        magicCount++;
      }
    }
    // Also detect in expect().toBe(number)
    const expectNum = line.matchAll(/\.toBe\s*\(\s*(\d+)\s*\)/g);
    for (const em of expectNum) {
      const val = parseInt(em[1], 10);
      if (val > 1 && val !== 42 && val !== 200 && val !== 404 && val !== 500 && val !== 100) {
        magicCount++;
      }
    }
  }

  // Cap at reasonable amount
  return { genericNames, hasAaaMarkers, magicNumberCount: Math.min(magicCount, 10) };
}

// ── Speed detection ──────────────────────────────────────────────────────

function detectSpeed(lines: string[], lang: Language): {
  sleepWaitCount: number;
  realIoCount: number;
} {
  if (!lang) return { sleepWaitCount: 0, realIoCount: 0 };

  const sleepCount = countPattern(lines, SLEEP_PATTERNS[lang] || []);
  const ioCount = countPattern(lines, [
    ...(FILESYSTEM_PATTERNS[lang] || []),
    ...(NETWORK_PATTERNS[lang] || []),
    ...(DATABASE_PATTERNS[lang] || []),
  ]);

  // Don't double-count if mock lib present
  const mockLibRe = MOCK_LIB_PATTERNS[lang];
  const hasMockLib = mockLibRe ? mockLibRe.test(lines.join("\n")) : false;

  return {
    sleepWaitCount: sleepCount,
    realIoCount: hasMockLib ? 0 : Math.min(ioCount, 5), // cap at 5
  };
}

// ── Coverage depth detection (partial — LLM fills rest) ──────────────────

const ERROR_PATH_PATTERNS: Record<string, RegExp[]> = {
  js: [
    /\.rejects\b/, /\bthrows\b/, /\btoThrow\b/, /expect\s*\(\s*\(\)\s*=>/, /\.toThrowError/,
    /assert\.throws/, /assert\.rejects/,
    // Test names indicating error testing
    /\b(?:test|it)\s*\(\s*["'`][^"'`]*(?:error|fail|invalid|throw|except|reject|bad|wrong|not.?found|unauthorized)[^"'`]*["'`]/i,
  ],
  py: [
    /\bpytest\.raises\s*\(/, /\bself\.assertRaises\s*\(/, /with\s+pytest\.raises/,
    /def\s+test[^:]*\b(?:error|fail|invalid|raise|except|bad|wrong)\b/i,
  ],
  rs: [
    /#\[should_panic\]/, /\.unwrap_err\s*\(/, /assert!\s*\(\w+\.is_err\s*\(/,
    /fn\s+test[^_]*\b(?:error|fail|invalid|panic|bad|wrong)\b/i,
  ],
  cs: [
    /\[ExpectedException\]/, /Assert\.Throws/, /Assert\.ThrowsAsync/,
    /\b(?:error|fail|invalid|throw|except|bad|wrong)\b.*test/i,
  ],
  go: [
    /\bassert\.Error\s*\(/, /\brequire\.Error\s*\(/, /if\s+err\s*!=\s*nil/,
    /func\s+Test[^_]*\b(?:Error|Fail|Invalid|Bad|Wrong)\b/,
  ],
};

const EDGE_CASE_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bnull\b/, /\bundefined\b/, /\[\s*\]/, /^\s*\/\/\s*(?:edge|boundary|empty|null|zero)/],
  py: [/\bNone\b/, /\[\s*\]/, /\{\s*\}/, /^\s*#\s*(?:edge|boundary|empty|null|zero)/],
  rs: [/\bNone\b/, /\bvec!\[/, /^\s*\/\/\s*(?:edge|boundary|empty|null|zero)/, /\b0\b.*test/],
  cs: [/\bnull\b/, /new\s+\w+\[\s*\]/, /^\s*\/\/\s*(?:edge|boundary|empty|null|zero)/],
  go: [/\bnil\b/, /\[\]\w+\{\}/, /^\s*\/\/\s*(?:edge|boundary|empty|null|zero)/],
};

function detectCoverageDepth(lines: string[], lang: Language, fns: TestFn[]):
  { errorPathFunctions: number; hasErrorIndicators: boolean; hasEdgeIndicators: boolean } {
  if (!lang || fns.length === 0) return { errorPathFunctions: 0, hasErrorIndicators: false, hasEdgeIndicators: false };

  const errorRes = ERROR_PATH_PATTERNS[lang] || [];
  const edgeRes = EDGE_CASE_PATTERNS[lang] || [];
  let errorCount = 0;
  let hasError = false;
  let hasEdge = false;

  for (let fi = 0; fi < fns.length; fi++) {
    const fnStart = fns[fi].line - 1;
    const fnEnd = fi < fns.length - 1 ? fns[fi + 1].line - 1 : lines.length;
    let fnHasError = false;
    for (let i = fnStart; i < Math.min(fnEnd, lines.length); i++) {
      if (errorRes.some(p => p.test(lines[i]))) { fnHasError = true; hasError = true; break; }
    }
    if (fnHasError) errorCount++;
  }

  const combined = lines.join("\n");
  hasEdge = edgeRes.some(p => p.test(combined));

  return { errorPathFunctions: errorCount, hasErrorIndicators: hasError, hasEdgeIndicators: hasEdge };
}

// ── Diagnostics detection ────────────────────────────────────────────────

function detectFrameworkDiff(lines: string[], lang: Language): boolean {
  if (!lang) return false;
  // Frameworks that show expected/actual diffs automatically
  const combined = lines.join("\n");
  switch (lang) {
    case "js":
      // Jest, Vitest, Node test runner all show diffs
      return true;
    case "py":
      // pytest shows diffs on assert failure; unittest doesn't
      return /\bpytest\b/.test(combined) || !/\bunittest\b/.test(combined);
    case "rs":
      // assert_eq! shows values inline
      return true;
    case "cs":
      // FluentAssertions shows good diffs; basic Assert doesn't
      return /\bFluentAssertions\b|\.Should\s*\(/.test(combined);
    case "go":
      // testify shows expected/actual; manual t.Error doesn't
      return /\btestify\b/.test(combined);
  }
  return false;
}

// ── File discovery ───────────────────────────────────────────────────────

const SOURCE_EXTS = new Set([
  ".js", ".ts", ".mjs", ".cjs", ".mts", ".cts", ".jsx", ".tsx",
  ".py", ".rs", ".cs", ".go", ".java", ".rb", ".swift", ".kt",
]);

const TEST_FILE_PATTERNS = [
  /\.test\.(ts|js|tsx|jsx|mts|mjs)$/,
  /\.spec\.(ts|js|tsx|jsx|mts|mjs)$/,
  /^test_.*\.py$/,
  /^.*_test\.py$/,
  /_test\.rs$/,
  /^test_.+\.rs$/,
  /Tests?\.cs$/,
  /_test\.go$/,
];

const SKIP_DIRS = new Set(["dist", "build", "out", ".next", "node_modules", "__pycache__", "target", ".git"]);

function isTestFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return TEST_FILE_PATTERNS.some(p => p.test(base));
}

function isSourceFile(fp: string): boolean {
  return SOURCE_EXTS.has(path.extname(fp).toLowerCase());
}

function isInSkipDir(fp: string): boolean {
  return fp.split(path.sep).some(p => SKIP_DIRS.has(p));
}

function extractTestFilesFromCommand(command: string, cwd: string): string[] {
  const tokens = command.split(/\s+/);
  const files: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("-")) continue;
    if (/^(python|python3?|pytest|node|npm|npx|pnpm|yarn|jest|vitest|mocha|ts-node|tsx|cargo|dotnet|go|git)$/.test(token)) continue;
    if (/^(test|run|exec|build)$/.test(token)) continue;

    if (token.includes(".") || token.includes("/") || token.includes("\\")) {
      const resolved = path.resolve(cwd, token);
      if (isInSkipDir(resolved)) continue;
      if (existsSync(resolved)) {
        if (statSync(resolved).isFile() && isTestFile(resolved)) files.push(resolved);
      } else {
        // Glob: dir/*.ext
        const dir = path.dirname(resolved);
        const pat = path.basename(resolved);
        if (existsSync(dir) && pat.includes("*")) {
          try {
            const regex = new RegExp("^" + pat.replace(/\*/g, ".*").replace(/\./g, "\\.") + "$");
            for (const entry of readdirSync(dir)) {
              const full = path.join(dir, entry);
              if (regex.test(entry) && !isInSkipDir(full) && statSync(full).isFile() && isTestFile(full)) {
                files.push(full);
              }
            }
          } catch { /* unreadable */ }
        }
      }
    }
  }

  return [...new Set(files)];
}

// ── Core scanner ─────────────────────────────────────────────────────────

function scanTestFile(filePath: string, cwd: string): TestFileMetrics | null {
  const lang = detectLanguage(filePath);
  if (!lang) return null;

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const relPath = path.relative(cwd, filePath).replace(/\\/g, "/");

  const testFunctions = detectTestFunctions(lines, lang);
  const testFunctionCount = testFunctions.length;

  const assertionCounts = countAssertions(lines, lang);
  const zeroAssertionFns = detectZeroAssertionFunctions(testFunctions, lines, lang);

  const determinism = detectDeterminism(lines, lang);
  const isolation = detectIsolation(lines, lang, testFunctions);
  const clarity = detectClarity(lines, lang, testFunctions);
  const speed = detectSpeed(lines, lang);
  const coverage = detectCoverageDepth(lines, lang, testFunctions);

  const frameworkShowsDiff = detectFrameworkDiff(lines, lang);

  // Determine what needs LLM classification
  const llmNeeded: string[] = [];
  if (assertionCounts.truthiness > 0) llmNeeded.push("truthiness_assertions"); // verify regex classification
  if (determinism.hasRealTime) llmNeeded.push("real_time_mocked"); // is Date.now() actually mocked?
  if (testFunctionCount > 0) llmNeeded.push("fixtures_per_test", "multi_behavior_count");
  if (clarity.magicNumberCount > 0) llmNeeded.push("magic_number_classification");
  if (speed.realIoCount > 0) llmNeeded.push("real_io_classification");
  llmNeeded.push("happy_vs_error_classification", "custom_matchers");

  // Deduplicate
  const uniqueNeeded = [...new Set(llmNeeded)];

  return {
    file: relPath,
    lineCount: lines.length,

    testFunctions,
    testFunctionCount,

    totalAssertions: assertionCounts.total,
    trivialAssertions: assertionCounts.trivial,
    truthinessAssertions: assertionCounts.truthiness,
    specificAssertions: assertionCounts.specific,
    zeroAssertionFunctions: zeroAssertionFns,
    assertionsWithMessage: assertionCounts.messaged,
    assertionsWithoutMessage: assertionCounts.unmessaged,

    ...determinism,

    hasSetupTeardown: isolation.hasSetupTeardown,
    moduleMutableCount: isolation.moduleMutableCount,
    hasTestOnly: isolation.hasTestOnly,
    createsOwnFixtures: null,

    genericNames: clarity.genericNames,
    hasAaaMarkers: clarity.hasAaaMarkers,
    magicNumberCount: clarity.magicNumberCount,
    multiBehaviorCount: null,

    sleepWaitCount: speed.sleepWaitCount,
    realIoCount: speed.realIoCount,

    errorPathFunctions: coverage.errorPathFunctions,
    happyPathFunctions: null,
    edgeCaseFunctions: null,

    frameworkShowsDiff,
    hasCustomMatchers: null,

    llm_classifications_needed: uniqueNeeded,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

export function analyseTestMetrics(command: string, cwd: string): TestMetricsReport | null {
  const files = extractTestFilesFromCommand(command, cwd);
  if (files.length === 0) return null;

  const perFile: TestFileMetrics[] = [];
  for (const file of files) {
    const metrics = scanTestFile(file, cwd);
    if (metrics) perFile.push(metrics);
  }

  return {
    files: files.map(f => path.relative(cwd, f).replace(/\\/g, "/")),
    perFile,
  };
}

/**
 * Score a single test file from its metrics (regex-extracted + LLM-filled).
 * Returns per-dimension scores 1-10 using calibrated formulas.
 */
export function scoreFromMetrics(m: TestFileMetrics): {
  assertion_quality: number;
  determinism: number;
  isolation: number;
  clarity: number;
  coverage_depth: number;
  speed: number;
  diagnostics: number;
  assertion_triviality: number;
  overall: number;
} {
  const tf = Math.max(m.testFunctionCount, 1);
  const ta = Math.max(m.totalAssertions, 1);

  // 1. Assertion Quality
  const density = Math.min(3.5, (ta / tf) * 1.8);
  const specificity = Math.min(4, (m.specificAssertions / ta) * 4);
  const coverage = Math.min(2.5, ((tf - Math.max(0, m.zeroAssertionFunctions - 1)) / tf) * 2.5);
  const assertion_quality = Math.round(Math.max(1, Math.min(10, 1 + density + specificity + coverage)));

  // 2. Determinism
  const detViolationCount = [
    m.hasRealTime, m.hasUnseededRandom, m.hasSleep,
    m.hasRealFilesystem, m.hasRealNetwork, m.hasRealDatabase,
  ].filter(Boolean).length + (m.hasSharedMutableState ? 0.5 : 0);
  const determinism = Math.round(Math.max(2, 10 - detViolationCount * 1.3));

  // 3. Isolation
  let isolationScore = 7;
  if (m.hasSetupTeardown) isolationScore += 1.5;
  // Only penalize more than 2 module-level vars (many test fixtures are singleton objects)
  const excessMutable = Math.max(0, m.moduleMutableCount - 2);
  isolationScore -= Math.min(2, excessMutable * 0.75);
  if (m.hasTestOnly) isolationScore -= 2;
  if (m.createsOwnFixtures === true) isolationScore += 1;
  const isolation = Math.round(Math.max(1, Math.min(10, isolationScore)));

  // 4. Clarity
  const nameQuality = tf > 0 ? (tf - m.genericNames.length) / tf : 0;
  let clarityScore = 2; // base
  clarityScore += Math.min(3, nameQuality * 3);
  if (m.hasAaaMarkers) clarityScore += 2;
  // Magic numbers: 0-1 is fine, 3+ is a problem
  clarityScore -= Math.min(2.5, Math.max(0, (m.magicNumberCount - 1)) * 0.5);
  if (m.multiBehaviorCount !== null) clarityScore -= Math.min(2, m.multiBehaviorCount);
  const clarity = Math.round(Math.max(1, Math.min(10, clarityScore)));

  // 5. Coverage Depth
  // Base of 3: happy-path-only tests still exercise code, just not deeply
  let covScore = 3;
  const errorRatio = m.errorPathFunctions / tf;
  covScore += Math.min(5, errorRatio * 8);
  // Edge cases: credit from regex detection (test names mentioning edge/boundary/null/empty)
  if (m.edgeCaseFunctions !== null && m.edgeCaseFunctions > 0) {
    const edgeRatio = m.edgeCaseFunctions / tf;
    covScore += Math.min(2, edgeRatio * 4);
  }
  // Test density bonus (tests per function covered)
  const density2 = ta / Math.max(tf, 1);
  covScore += Math.min(1, density2 > 3 ? 1 : density2 / 3);
  const coverage_depth = Math.round(Math.max(1, Math.min(10, covScore)));

  // 6. Speed
  const speedV = m.sleepWaitCount * 2 + m.realIoCount * 0.5; // sleep is worse than fs
  const speed = Math.round(Math.max(2, 10 - speedV * 1.0));

  // 7. Diagnostics
  let diagScore = 2; // base — framework gives some diagnostics
  const msgRatio = ta > 0 ? m.assertionsWithMessage / ta : 0;
  diagScore += Math.min(4.5, msgRatio * 5.5);
  if (m.frameworkShowsDiff) diagScore += 2.5;
  if (m.hasCustomMatchers === true) diagScore += 1;
  const diagnostics = Math.round(Math.max(1, Math.min(10, diagScore)));

  // 8. Assertion Triviality
  let trivialScore = 10;
  if (ta === 0) trivialScore = 1;
  else if (m.trivialAssertions > 0) {
    trivialScore = Math.max(1, 10 - Math.floor((m.trivialAssertions / ta) * 10));
  }
  const assertion_triviality = trivialScore;

  // Overall (weighted)
  const overall = parseFloat(((
    assertion_quality * 2 +
    determinism * 2 +
    isolation * 1 +
    clarity * 1 +
    coverage_depth * 2 +
    speed * 1 +
    diagnostics * 1 +
    assertion_triviality * 1
  ) / 11).toFixed(1));

  return {
    assertion_quality: Math.round(assertion_quality),
    determinism: Math.round(determinism),
    isolation,
    clarity,
    coverage_depth,
    speed,
    diagnostics,
    assertion_triviality,
    overall,
  };
}
