/**
 * Real reachability: run one bound test in isolation under c8, scoped to its
 * package's compiled `dist/` tree, and check whether a declared entry-point
 * file executed.
 *
 * c8 is invoked through its own `bin/c8.js`, and that through `node`
 * directly, both with `shell: false`. `shell: true` on Windows silently drops
 * `--test-name-pattern`'s value the moment it contains a space - which every
 * real test name does - so the isolation collapses into running the whole
 * file. Verified directly: the same command through `npx c8 ...` with
 * `shell: true` ran every test in the file; the identical arguments through
 * `node bin/c8.js ...` with `shell: false` ran exactly the one test named.
 *
 * c8's `json` reporter names files after remapping through the source map, so
 * its keys are absolute, OS-native paths to the `.ts` source, not
 * repo-relative ones - entry-point matching resolves the declared paths to
 * absolute before comparing. It also carries a per-function hit-count map
 * (`f`). That, not file-level statement coverage, is what "integrated" checks:
 * a test that only imports an entry-point file already executes that file's
 * top-level statements - the function declarations - so file-level coverage
 * alone can't tell "imported" from "called". Verified directly: a test that
 * imports but never calls the function it imports leaves that function's
 * hit count at 0, next to a sibling test that calls it and leaves it at 1.
 *
 * The child's env drops `NODE_TEST_CONTEXT`. Node's test runner sets it on
 * itself, the child inherits it by default, and a child that sees it already
 * set treats its own `--test` invocation as a recursive re-entry and skips
 * running anything - silently, exit 0, empty output. Verified directly: the
 * same invocation ran real subtests only after this was stripped.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { distTestFile } from "./dist-file.js";
import { packageDirForGroup } from "./package-dir.js";
import type { Outcome } from "./report.js";

const execFileP = promisify(execFile);

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Absolute paths of every file with at least one function actually called
 * during the run - not merely loaded. `f` is Istanbul's per-function
 * hit-count map, keyed by fnMap id, in `coverage-final.json`. */
async function readIntegratedFiles(reportDir: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(reportDir, "coverage-final.json"), "utf-8");
    const coverage = JSON.parse(raw) as Record<string, { f: Record<string, number> }>;
    const integrated = new Set<string>();
    for (const [file, fileCoverage] of Object.entries(coverage)) {
      if (Object.values(fileCoverage.f).some((hits) => hits > 0)) integrated.add(file);
    }
    return integrated;
  } catch {
    return new Set();
  }
}

interface ReachabilityInput {
  cwd: string;
  group: string;
  testName: string;
  /** Absolute path to the source test file a marker was found in. */
  testFile: string;
  /** Repo-relative entry-point paths declared for this group's package. */
  entryPointFiles: string[];
}

export async function checkReachability(input: ReachabilityInput): Promise<{ outcome: Outcome; note: string }> {
  const pkgDir = packageDirForGroup(input.group);
  const execTestFile = distTestFile(input.cwd, pkgDir, input.testFile);

  if (!(await fileExists(execTestFile))) {
    const rel = path.relative(input.cwd, execTestFile);
    return { outcome: "failed", note: `compiled test file not found: ${rel} - run npm run build first` };
  }

  const c8Bin = path.join(input.cwd, "node_modules", "c8", "bin", "c8.js");
  if (!(await fileExists(c8Bin))) {
    return { outcome: "failed", note: "c8 is not installed at the repo root - run npm install" };
  }

  const includeGlob = pkgDir.startsWith("packages/") ? `${pkgDir}/dist/**/*.js` : `${pkgDir}/**/*.js`;
  const pattern = `^${escapeForRegExp(input.testName)}$`;
  const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-cover-"));
  // NODE_V8_COVERAGE tells V8 where to dump raw coverage. Inherited from a
  // parent that is itself running under c8 - exactly what check-coverage.mjs
  // does - it points this nested c8 at the outer run's own coverage
  // directory, mixing the two runs' raw files together. The inner c8 manages
  // its own directory via --report-dir; it needs none of the outer one.
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.NODE_V8_COVERAGE;

  try {
    let stdout: string;
    try {
      const run = await execFileP(
        process.execPath,
        [
          c8Bin,
          `--include=${includeGlob}`,
          "--reporter=json",
          `--report-dir=${reportDir}`,
          process.execPath,
          "--experimental-test-module-mocks",
          "--test",
          `--test-name-pattern=${pattern}`,
          execTestFile,
        ],
        { cwd: input.cwd, shell: false, encoding: "utf-8", env: childEnv },
      );
      stdout = run.stdout;
    } catch {
      return { outcome: "failed", note: `bound test "${input.testName}" failed` };
    }

    // --test-name-pattern matching nothing still exits 0 - node reports a
    // synthetic passing "test" for the file itself. Confirm the named test
    // actually ran, not just that the process exited clean.
    if (!stdout.includes(`# Subtest: ${input.testName}`)) {
      return { outcome: "failed", note: `no test named "${input.testName}" found in ${execTestFile}` };
    }

    if (input.entryPointFiles.length === 0) {
      return {
        outcome: "covered-but-not-integrated",
        note: `bound test passed; no entry points declared for ${pkgDir} in openspec/entry-points.json`,
      };
    }

    const integratedFiles = await readIntegratedFiles(reportDir);
    const integrated = input.entryPointFiles.some((file) => integratedFiles.has(path.resolve(input.cwd, file)));

    return integrated
      ? { outcome: "covered-and-integrated", note: "bound test passed and reached a declared entry point" }
      : { outcome: "covered-but-not-integrated", note: "bound test passed but reached no declared entry point" };
  } finally {
    await fs.rm(reportDir, { recursive: true, force: true });
  }
}
