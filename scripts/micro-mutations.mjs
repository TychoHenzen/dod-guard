#!/usr/bin/env node

// micro-mutations.mjs — Incremental mutation testing via Stryker + node --test
//
// Picks N files via weighted random selection (staleness×0.50 + size×0.30 +
// churn×0.20 + dirty×0.15), runs Stryker scoped to each, updates state JSON
// and generates a human-readable markdown report. Designed for daily CI cron
// runs. Tracks SHA-256 fingerprints to detect dirty files (modified since
// last mutation run). --all mode selects every eligible file regardless of
// test history.
//
// Usage:
//   node scripts/micro-mutations.mjs [--dry-run] [--init-state] [--all] [--dirty]
//   MICRO_MUTATION_COUNT=3 node scripts/micro-mutations.mjs
//   node scripts/micro-mutations.mjs --all    # full sweep: all eligible files
//   node scripts/micro-mutations.mjs --dirty  # CI daily: only dirty files

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Paths (relative to repo root) ───────────────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = join(ROOT, "docs", ".micro_mutation_state.json");
const REPORT_FILE = join(ROOT, "docs", "MICRO_MUTATIONS.md");
const STRIKER_CONFIG = "stryker.config.json";

// ── Configuration ───────────────────────────────────────────────────────

const COUNT = parseInt(process.env.MICRO_MUTATION_COUNT || "3", 10);
const W_STALENESS = parseFloat(process.env.STALENESS_WEIGHT || "0.50");
const W_SIZE = parseFloat(process.env.SIZE_WEIGHT || "0.30");
const W_CHURN = parseFloat(process.env.CHURN_WEIGHT || "0.20");
const W_DIRTY = parseFloat(process.env.DIRTY_WEIGHT || "0.15");
const DRY_RUN = process.argv.includes("--dry-run");
const INIT_STATE = process.argv.includes("--init-state");
const ALL_MODE = process.argv.includes("--all");
const DIRTY_MODE = process.argv.includes("--dirty");

// Files excluded from mutation testing
const EXCLUDE_PATTERNS = ["*.test.ts", "types.ts", "constants.ts", "schemas.ts"];

// Sentinel fingerprint: never-tested files are dirty by definition
const ZERO_FINGERPRINT = "0000000000000000000000000000000000000000000000000000000000000000";

// ── Helpers ─────────────────────────────────────────────────────────────

function nowISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

// ── Fingerprint (SHA-256 of source file) ────────────────────────────────

function computeFingerprint(filePath) {
  try {
    const content = readFileSync(join(ROOT, filePath), "utf-8");
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

// ── Stryker output parser ────────────────────────────────────────────────
// Stryker v9 table format:
//   -----------|------------------|----------|-----------|------------|----------|----------|
//              | % Mutation score |          |           |            |          |          |
//   File       |  total | covered | # killed | # timeout | # survived | # no cov | # errors |
//   -----------|--------|---------|----------|-----------|------------|----------|----------|
//   All files  |  63.64 |   70.00 |       28 |         0 |         12 |        4 |        0 |
// Note: "total" is the % score, not mutant count. Total mutants = killed + survived + timeout + no_cov.

function parseStrykerRow(output) {
  const lines = output.split(/\r?\n/);
  // Find the row with "# survived" — this is the third header row
  const hi = lines.findIndex((l) => l.includes("|") && /#\s*survived/i.test(l));
  if (hi === -1) return null;

  const headerCols = lines[hi].split("|").map((c) => c.trim().toLowerCase());
  const idxKilled = headerCols.findIndex((c) => c === "# killed");
  const idxTimeout = headerCols.findIndex((c) => c === "# timeout");
  const idxSurvived = headerCols.findIndex((c) => c === "# survived");
  const idxNoCov = headerCols.findIndex((c) => c === "# no cov");

  // Find the "All files" summary row
  const dl = lines.find(
    (l) => l.includes("|") && l.trim().toLowerCase().startsWith("all files"),
  );
  if (!dl) return null;
  const cells = dl.split("|").map((c) => c.trim());

  const get = (idx) => {
    if (idx < 0 || idx >= cells.length) return 0;
    return parseInt(cells[idx], 10) || 0;
  };

  const killed = get(idxKilled);
  const survived = get(idxSurvived);
  const timeout = get(idxTimeout);
  const unviable = get(idxNoCov);

  return {
    total: killed + survived + timeout + unviable,
    killed,
    survived,
    timeout,
    unviable,
  };
}

// ── State management ────────────────────────────────────────────────────

function defaultState() {
  return {
    files: {},
    cumulative: {
      total_mutants: 0,
      caught: 0,
      missed: 0,
      timeout: 0,
      unviable: 0,
      error: 0,
      runs: 0,
      files_tested: 0,
    },
    runs: [],
  };
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        files: parsed.files || {},
        cumulative: {
          total_mutants: parsed.cumulative?.total_mutants ?? 0,
          caught: parsed.cumulative?.caught ?? 0,
          missed: parsed.cumulative?.missed ?? 0,
          timeout: parsed.cumulative?.timeout ?? 0,
          unviable: parsed.cumulative?.unviable ?? 0,
          error: parsed.cumulative?.error ?? 0,
          runs: parsed.cumulative?.runs ?? 0,
          files_tested: parsed.cumulative?.files_tested ?? 0,
        },
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      };
    }
  } catch (err) {
    console.error(
      "micro-mutations: failed to load state, starting fresh",
      { err: err instanceof Error ? err.message : String(err) },
    );
  }
  return defaultState();
}

function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ── File discovery ──────────────────────────────────────────────────────

function scanEligibleFiles() {
  const result = [];
  try {
    // Use git ls-files for cross-platform portability
    const srcFiles = execSync(
      'git ls-files "packages/*/src/*.ts"',
      { cwd: ROOT, encoding: "utf-8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    const excludeRes = EXCLUDE_PATTERNS.map(globToRegex);

    for (const f of srcFiles) {
      const base = basename(f);
      if (excludeRes.some((re) => re.test(base))) continue;
      if (f.includes("/skills/") || f.includes("/standards/")) continue;
      result.push(f);
    }
  } catch (err) {
    console.error("micro-mutations: file scan failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}

function countLines(filePath) {
  try {
    const content = readFileSync(join(ROOT, filePath), "utf-8");
    return content.split("\n").filter((l) => l.trim() !== "").length;
  } catch {
    return 0;
  }
}

// ── Git churn ───────────────────────────────────────────────────────────

function buildChurnMap(days = 90) {
  const churn = {};
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const output = execSync(
      `git log --since=${sinceStr} --format= --name-only -- packages/`,
      { cwd: ROOT, encoding: "utf-8" },
    );
    for (const line of output.trim().split("\n")) {
      const p = line.replace(/\\/g, "/").trim();
      if (p && p.endsWith(".ts")) {
        churn[p] = (churn[p] || 0) + 1;
      }
    }
  } catch (err) {
    console.error("micro-mutations: churn map failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return churn;
}

// ── Selection algorithm ─────────────────────────────────────────────────

function computeScore(fileInfo, nowStr) {
  const stalenessDays = fileInfo.last_tested
    ? Math.min(daysBetween(fileInfo.last_tested, nowStr), 90)
    : 90;
  const stalenessNorm = stalenessDays / 90.0;

  const lines = fileInfo.lines > 0 ? fileInfo.lines : 1;
  const sizeNorm = Math.min(Math.log2(lines) / 11.0, 1.0);

  const churn90d = fileInfo.recent_commits || 0;
  const churnNorm = Math.min(churn90d / 10.0, 1.0);

  // Dirty bonus: file modified since last mutation run
  const dirty = fileInfo.dirty ? 1.0 : 0.0;

  const score =
    stalenessNorm * W_STALENESS +
    sizeNorm * W_SIZE +
    churnNorm * W_CHURN +
    dirty * W_DIRTY;

  return { score, stalenessDays, lines, churn90d, dirty: !!fileInfo.dirty };
}

function selectFiles(state, nowStr, count) {
  const eligible = scanEligibleFiles();
  const churnMap = buildChurnMap();

  for (const f of eligible) {
    if (!state.files[f]) {
      state.files[f] = {
        last_tested: null,
        last_result: null,
        lines: countLines(f),
        error_count: 0,
        recent_commits: churnMap[f] || 0,
        fingerprint: ZERO_FINGERPRINT,
      };
    } else {
      state.files[f].lines = countLines(f);
      state.files[f].recent_commits = churnMap[f] || 0;
    }
  }

  // Check fingerprints for ALL eligible files every run.
  // Zero-fingerprint (never tested) == dirty by definition.
  // Non-zero fingerprint: compare current SHA-256 against stored.
  for (const f of eligible) {
    const info = state.files[f];
    const current = computeFingerprint(f);
    if (!info.fingerprint || info.fingerprint === ZERO_FINGERPRINT) {
      // Never tested, or pre-fingerprint era — dirty by definition
      info.fingerprint = ZERO_FINGERPRINT;
      info.dirty = true;
    } else {
      // Has real stored fingerprint — compare against current source
      info.dirty = current !== null && current !== info.fingerprint;
    }
  }

  for (const key of Object.keys(state.files)) {
    if (!eligible.includes(key)) {
      delete state.files[key];
    }
  }

  const scored = Object.entries(state.files).map(([path, info]) => ({
    path,
    ...computeScore(info, nowStr),
  }));
  scored.sort((a, b) => b.score - a.score);

  // ── --all / --dirty modes: select files by flag ───────────────────────
  // --all: every eligible file. --dirty: only files with changed fingerprint.
  // Both flags respect COUNT if set (MICRO_MUTATION_COUNT env var).
  if (ALL_MODE || DIRTY_MODE) {
    let candidates = [...scored];
    const modeLabel = ALL_MODE ? "--all" : "--dirty";

    if (DIRTY_MODE) {
      candidates = candidates.filter((s) => s.dirty);
      if (candidates.length === 0) {
        console.log("--dirty: no dirty files, nothing to do.");
        return [];
      }
    }

    // If COUNT is set to a positive value, limit candidates (sorted by score desc)
    if (COUNT > 0 && COUNT < candidates.length) {
      console.log(`${modeLabel}: limiting to top ${COUNT} of ${candidates.length} candidates`);
      candidates = candidates.slice(0, COUNT);
    }

    const dirtyCount = candidates.filter((s) => s.dirty).length;
    console.log(`${modeLabel}: ${candidates.length} files (${dirtyCount} dirty)`);
    for (const s of candidates.slice(0, 10)) {
      console.log(
        `  ${(s.score * 100).toFixed(1)}%  ${s.path}  (stale=${s.stalenessDays}d, lines=${s.lines}, churn=${s.churn90d}, dirty=${s.dirty})`,
      );
    }
    if (candidates.length > 10) {
      console.log(`  ... and ${candidates.length - 10} more`);
    }
    return candidates.map((s) => s.path);
  }

  console.log("Top 10 priority files:");
  for (const s of scored.slice(0, 10)) {
    console.log(
      `  ${(s.score * 100).toFixed(1)}%  ${s.path}  (stale=${s.stalenessDays}d, lines=${s.lines}, churn=${s.churn90d}, dirty=${s.dirty})`,
    );
  }

  // Weighted random selection without replacement
  const selected = [];
  const remaining = [...scored];

  for (let i = 0; i < Math.min(count, remaining.length); i++) {
    const totalWeight = remaining.reduce((sum, f) => sum + f.score, 0);
    if (totalWeight <= 0) {
      const idx = Math.floor(Math.random() * remaining.length);
      selected.push(remaining[idx].path);
      remaining.splice(idx, 1);
      continue;
    }

    const draw = Math.random() * totalWeight;
    let cumulative = 0;
    for (let j = 0; j < remaining.length; j++) {
      cumulative += remaining[j].score;
      if (cumulative >= draw) {
        selected.push(remaining[j].path);
        remaining.splice(j, 1);
        break;
      }
    }
  }

  return selected;
}

// ── Stryker execution ───────────────────────────────────────────────────

function srcToDist(srcPath) {
  // packages/dod-guard/src/checker.ts → packages/dod-guard/dist/checker.js
  // packages/dod-guard/src/tools/dod-create.ts → packages/dod-guard/dist/tools/dod-create.js
  const normalized = srcPath.replace(/\\/g, "/");
  return normalized.replace(/\/src\//, "/dist/").replace(/\.ts$/, ".js");
}

function pkgFromPath(srcPath) {
  const parts = srcPath.split(/[\\/]/);
  if (parts[0] === "packages" && parts[1]) {
    return `packages/${parts[1]}`;
  }
  return "";
}

function runMutation(srcPath) {
  const distPath = srcToDist(srcPath);
  const pkg = pkgFromPath(srcPath);
  // Normalize to forward slashes for cross-platform Stryker/cli compatibility
  const distPathFwd = distPath.replace(/\\/g, "/");

  console.log(`\n=== MUTATING: ${srcPath} (${distPathFwd}) ===`);

  if (!existsSync(join(ROOT, distPath))) {
    const msg = `dist file not found: ${distPathFwd}`;
    console.log(`  → ${msg}`);
    return {
      output: msg,
      result: {
        total: 0, caught: 0, missed: 0, timeout: 0, unviable: 0,
        status: "error", error: msg,
      },
    };
  }

  if (DRY_RUN) {
    console.log("  DRY_RUN: would run stryker");
    return {
      output: "DRY_RUN",
      result: {
        total: 0, caught: 0, missed: 0, timeout: 0, unviable: 0,
        status: "ok", error: null,
      },
    };
  }

  console.log("  running Stryker...");
  try {
    const strykerOut = execSync(
      `npx stryker run ${STRIKER_CONFIG} --mutate "${distPathFwd}" --concurrency 2`,
      { cwd: ROOT, encoding: "utf-8", timeout: 15 * 60_000, stdio: ["pipe", "pipe", "pipe"] },
    );

    if (
      strykerOut.includes("No mutants to test") ||
      strykerOut.includes("Found 0 mutants")
    ) {
      console.log("  → 0 mutants found");
      return {
        output: strykerOut,
        result: {
          total: 0, caught: 0, missed: 0, timeout: 0, unviable: 0,
          status: "no_mutants", error: null,
        },
      };
    }

    const parsed = parseStrykerRow(strykerOut);
    if (!parsed) {
      console.log("  → could not parse Stryker output");
      const tail = strykerOut.split("\n").slice(-20).join("\n");
      console.log("  Last 20 lines of output:", tail);
      return {
        output: strykerOut,
        result: {
          total: 0, caught: 0, missed: 0, timeout: 0, unviable: 0,
          status: "parse_error", error: "could not parse Stryker output",
        },
      };
    }

    console.log(
      `  → ${parsed.total} mutants: ${parsed.killed} killed, ${parsed.survived} survived, ${parsed.timeout} timeout, ${parsed.unviable} no-cov`,
    );
    return {
      output: strykerOut,
      result: {
        total: parsed.total,
        caught: parsed.killed,
        missed: parsed.survived,
        timeout: parsed.timeout,
        unviable: parsed.unviable,
        status: "ok",
        error: null,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Capture stderr — Stryker writes crash details (unhandled rejections, etc.) there
    const stderrStr = (err && typeof err === "object" && "stderr" in err) ? String(err.stderr) : "";
    const stderrTail = stderrStr ? stderrStr.split("\n").slice(-10).join("\n") : "";
    console.log("  → Stryker failed:", msg.slice(0, 300));
    if (stderrTail) console.log("  Stryker stderr tail:\n", stderrTail);
    return {
      output: stderrTail || msg,
      result: {
        total: 0, caught: 0, missed: 0, timeout: 0, unviable: 0,
        status: "error", error: msg.slice(0, 300),
      },
    };
  }
}

// ── Markdown report generator ───────────────────────────────────────────

function statusIcon(r) {
  if (!r) return "⬜";
  switch (r.status) {
    case "ok":
      // ✅ only when 100% kill rate (zero survivors AND at least one killed)
      return r.missed === 0 && r.caught > 0 ? "✅" : "⚠️";
    case "no_mutants":
      return "➖";
    case "error":
    case "parse_error":
      return "❌";
    default:
      return "⬜";
  }
}

function generateMarkdown(state, nowStr, commit) {
  const lines = [];
  const c = state.cumulative;
  const catchRate =
    c.total_mutants > 0
      ? ((c.caught / c.total_mutants) * 100).toFixed(1)
      : "N/A";

  lines.push(
    "# Micro-Mutation Report",
    "",
    `**Generated**: ${nowStr} | **Commit**: \`${commit.slice(0, 7)}\``,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Total mutants | ${c.total_mutants} |`,
    `| Killed | ${c.caught} |`,
    `| Missed | ${c.missed} |`,
    `| Timeout | ${c.timeout} |`,
    `| No coverage | ${c.unviable} |`,
    `| Catch rate | ${catchRate}% |`,
    `| Runs | ${c.runs} |`,
    `| Files tested | ${c.files_tested} |`,
    "",
  );

  if (state.runs.length > 0) {
    const last = state.runs[state.runs.length - 1];
    lines.push(
      `**Last run**: ${last.date} — \`${last.file}\` → ${last.result?.status || "unknown"}`,
    );
    lines.push("");
  }

  // File inventory table
  lines.push(
    "## File Inventory",
    "",
    "| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |",
    "|------|------|-------|-------|-------|-------|-------------|--------|--------|",
  );

  const scored = Object.entries(state.files).map(([path, info]) => ({
    path,
    ...computeScore(info, nowStr),
    info,
  }));
  scored.sort((a, b) => b.score - a.score);

  for (const s of scored) {
    const lr = s.info.last_result;
    const prio = `${(s.score * 100).toFixed(0)}%`;
    const lrSummary = lr
      ? lr.status === "no_mutants"
        ? "0 mutants"
        : `${lr.caught}/${lr.total} killed`
      : "—";
    const lrDate = s.info.last_tested || "—";
    const dirtyMark = s.info.dirty ? "🟡" : "—";
    lines.push(
      `| ${prio} | ${s.path} | ${s.lines} | ${s.churn90d} | ${s.stalenessDays}d | ${dirtyMark} | ${lrDate} | ${lrSummary} | ${statusIcon(lr)} |`,
    );
  }
  lines.push("");

  // Recent runs
  if (state.runs.length > 0) {
    lines.push(
      "## Recent Runs",
      "",
      "| Date | Commit | File | Mutants | Killed | Missed | Status |",
      "|------|--------|------|---------|--------|--------|--------|",
    );
    for (const run of state.runs.slice(-30).reverse()) {
      const r = run.result;
      const total = r ? `${r.total}` : "—";
      const killed = r ? `${r.caught}` : "—";
      const missed = r ? `${r.missed}` : "—";
      lines.push(
        `| ${run.date} | \`${run.commit.slice(0, 7)}\` | ${run.file} | ${total} | ${killed} | ${missed} | ${r?.status || "—"} |`,
      );
    }
    lines.push("");
  }

  // Exclusions
  lines.push(
    "## Exclusions",
    "",
    ...EXCLUDE_PATTERNS.map((p) => `- \`${p}\``),
    "— plus `skills/`, `standards/`, `dist/`, `node_modules/` directories",
    "",
    "<!-- Generated by scripts/micro-mutations.mjs -->",
  );

  return lines.join("\n");
}

// ── Main ────────────────────────────────────────────────────────────────

function getCommitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function main() {
  const nowStr = nowISO();
  const commit = getCommitSha();

  console.log(
    `micro-mutations.mjs — ${nowStr} — commit ${commit.slice(0, 7)}`,
  );
  console.log(
    `count=${COUNT}, staleness=${W_STALENESS}, size=${W_SIZE}, churn=${W_CHURN}, dirty=${W_DIRTY}`,
  );
  console.log(`dry-run=${DRY_RUN}, init-state=${INIT_STATE}, all=${ALL_MODE}, dirty=${DIRTY_MODE}`);

  const state = loadState();

  if (INIT_STATE) {
    console.log("Initializing state (scanning files)...");
    const eligible = scanEligibleFiles();
    const churnMap = buildChurnMap();
    for (const f of eligible) {
      state.files[f] = {
        last_tested: null,
        last_result: null,
        lines: countLines(f),
        error_count: 0,
        recent_commits: churnMap[f] || 0,
        fingerprint: ZERO_FINGERPRINT,
      };
    }
    saveState(state);
    console.log(`State initialized with ${Object.keys(state.files).length} files.`);
    const report = generateMarkdown(state, nowStr, commit);
    writeFileSync(REPORT_FILE, report, "utf-8");
    console.log(`Initial report saved to ${REPORT_FILE}`);
    return;
  }

  if (COUNT <= 0 && !ALL_MODE && !DIRTY_MODE) {
    console.log("MICRO_MUTATION_COUNT=0, --all/--dirty not set, nothing to do.");
    return;
  }

  const selected = selectFiles(state, nowStr, COUNT);
  console.log(`\nSelected ${selected.length} file(s) for mutation:`);
  for (const f of selected) {
    console.log(`  - ${f}`);
  }

  // Track built packages to avoid redundant builds
  const builtPkgs = new Set();

  for (let i = 0; i < selected.length; i++) {
    const srcPath = selected[i];
    console.log(`\n[${i + 1}/${selected.length}] ${srcPath}`);

    // Build package once per package
    const pkg = pkgFromPath(srcPath);
    if (pkg && !builtPkgs.has(pkg) && !DRY_RUN) {
      console.log(`  building: ${pkg}`);
      try {
        execSync(`npm run build -w ${pkg}`, {
          cwd: ROOT,
          encoding: "utf-8",
          stdio: "pipe",
        });
        builtPkgs.add(pkg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  build failed: ${msg.slice(0, 200)}`);
        const info = state.files[srcPath];
        if (info) {
          info.last_tested = nowStr;
          info.last_result = {
            total: 0, caught: 0, missed: 0, timeout: 0, unviable: 0,
            status: "error", error: `build failed: ${msg.slice(0, 200)}`,
          };
          info.error_count += 1;
          info.fingerprint = ZERO_FINGERPRINT;
        }
        state.cumulative.error += 1;
        state.cumulative.runs += 1;
        state.runs.push({
          date: nowStr, commit, file: srcPath,
          result: info?.last_result || { status: "error" },
        });
        continue;
      }
    }

    const { result } = runMutation(srcPath);

    if (!DRY_RUN) {
      const info = state.files[srcPath];
      if (info) {
        info.last_tested = nowStr;
        info.last_result = result;
        if (result?.status === "error" || result?.status === "parse_error") {
          info.error_count += 1;
        }
        // Store fingerprint of the source file at test time
        if (result?.status === "ok" || result?.status === "no_mutants") {
          info.fingerprint = computeFingerprint(srcPath);
          info.dirty = false;
        }
      }

      if (result) {
        state.cumulative.total_mutants += result.total;
        state.cumulative.caught += result.caught;
        state.cumulative.missed += result.missed;
        state.cumulative.timeout += result.timeout;
        state.cumulative.unviable += result.unviable;
        if (result.status === "error" || result.status === "parse_error") {
          state.cumulative.error += 1;
        }
      }
      state.cumulative.runs += 1;
      state.cumulative.files_tested += 1;

      state.runs.push({ date: nowStr, commit, file: srcPath, result });
      if (state.runs.length > 100) state.runs = state.runs.slice(-100);
    }

    // Restore mutated dist files
    if (!DRY_RUN && pkg) {
      try {
        execSync(`git checkout -- ${pkg}/dist/`, {
          cwd: ROOT,
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch {
        // Non-fatal
      }
    }
  }

  saveState(state);
  console.log(`\nState saved to ${STATE_FILE}`);

  const report = generateMarkdown(state, nowStr, commit);
  writeFileSync(REPORT_FILE, report, "utf-8");
  console.log(`Report saved to ${REPORT_FILE}`);

  const c = state.cumulative;
  const catchRate =
    c.total_mutants > 0
      ? ((c.caught / c.total_mutants) * 100).toFixed(1)
      : "N/A";
  console.log(
    `\nDone. Cumulative: ${c.total_mutants} mutants | ${c.caught} killed | ${c.missed} missed | ${catchRate}% catch rate | ${c.runs} runs`,
  );
}

main();
