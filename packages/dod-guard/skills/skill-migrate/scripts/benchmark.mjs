#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = dirname(_filename);

/**
 * Validate one scenario object against the shape generate-scenarios.mjs
 * produces. Returns { valid, issues[] }. Never throws.
 */
export function validateScenario(scenario) {
  const issues = [];

  if (!scenario || typeof scenario !== "object") {
    return { valid: false, issues: ["scenario is not an object"] };
  }
  if (!scenario.id) issues.push("missing required field: id");
  if (!scenario.prompt) issues.push("missing required field: prompt");

  const files = scenario.fixtures?.files;
  if (!files || typeof files !== "object") {
    issues.push("missing required field: fixtures.files");
  } else {
    for (const [relPath, source] of Object.entries(files)) {
      if (typeof source === "object" && source !== null) continue;
      if (typeof source !== "string") {
        issues.push(`${relPath}: fixture value must be a string or object`);
        continue;
      }
      if (source.startsWith("inline:")) continue;
      if (source.startsWith("copy:")) {
        const srcPath = source.slice(5);
        if (!existsSync(srcPath)) {
          issues.push(`${relPath}: copy: source does not exist: ${srcPath}`);
        }
        continue;
      }
      issues.push(`${relPath}: fixture value must start with "inline:" or "copy:"`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Read every *.json file in scenariosDir and validate it. Returns
 * { count, results: [{ file, valid, issues }] }. Never throws or exits.
 */
export function validateScenariosDir(scenariosDir) {
  const files = readdirSync(scenariosDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const results = files.map((file) => {
    const path = join(scenariosDir, file);
    let scenario;
    try {
      scenario = JSON.parse(readFileSync(path, "utf-8"));
    } catch (err) {
      return { file, valid: false, issues: [`invalid JSON: ${err.message}`] };
    }
    const { valid, issues } = validateScenario(scenario);
    return { file, valid, issues };
  });

  return { count: results.length, results };
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Fold per-scenario results into the objective aggregate benchmark number.
 * Exported so it can be exercised with injected results, no subprocesses.
 */
export function aggregateResults(scenarioResults) {
  const grades = scenarioResults.map((s) => s.grade).filter((g) => g != null);
  const allProperties = scenarioResults.flatMap((s) => s.properties ?? []);
  const timings = scenarioResults.map((s) => s.timing).filter((t) => t != null);

  const behaviorScores = allProperties
    .map((p) => p.behavior_score)
    .filter((v) => typeof v === "number");

  let totalMutationsFixed = 0;
  let totalMutations = 0;
  for (const p of allProperties) {
    if (p.mutations_fixed && typeof p.mutations_fixed.total === "number") {
      totalMutationsFixed += p.mutations_fixed.fixed ?? 0;
      totalMutations += p.mutations_fixed.total;
    }
  }

  const syntaxValidCount = allProperties.filter((p) => p.syntax_valid === true).length;
  const syntaxInvalidCount = allProperties.filter((p) => p.syntax_valid === false).length;

  return {
    mean_pass_rate: mean(grades.map((g) => g.pass_rate)),
    mean_behavior_score: mean(behaviorScores),
    total_mutations_fixed: totalMutationsFixed,
    total_mutations: totalMutations,
    mutations_fixed_rate: totalMutations > 0 ? totalMutationsFixed / totalMutations : 0,
    syntax_valid_count: syntaxValidCount,
    syntax_invalid_count: syntaxInvalidCount,
    mean_tokens: mean(timings.map((t) => t.tokens ?? 0)),
    mean_duration_ms: mean(timings.map((t) => t.duration_ms ?? 0)),
  };
}

/**
 * Wrap a benchmark.json document into the {runs:[...]} shape compare-runs.mjs
 * consumes, one run per scenario.
 */
export function toCompareRunsFormat(benchmark) {
  return {
    runs: benchmark.scenarios.map((s) => ({
      eval_id: s.id,
      eval_name: s.id,
      result: {
        pass_rate: s.grade?.pass_rate ?? 0,
        tokens: s.timing?.tokens ?? 0,
        tool_calls: s.timing?.tool_calls ?? 0,
      },
    })),
  };
}

function runNode(scriptName, args) {
  return execFileSync(process.execPath, [join(SCRIPTS_DIR, scriptName), ...args], {
    encoding: "utf-8",
  });
}

/**
 * Invoke run-eval.mjs for a scenario's sandbox. run-eval exits non-zero when
 * the claude run exits non-zero. The transcript and timing files are still
 * written, so grading can continue.
 */
function invokeEval({ sandboxDir, scenario, skill, model, scenarioOutDir }) {
  const evalArgs = [`--sandbox=${sandboxDir}`, `--prompt=${scenario.prompt}`, `--out=${scenarioOutDir}`];
  if (skill) evalArgs.push(`--skill=${skill}`);
  if (model) evalArgs.push(`--model=${model}`);
  try {
    runNode("run-eval.mjs", evalArgs);
  } catch {
    // see doc comment: non-zero here does not mean the pipeline stops.
  }
}

/**
 * Grade a scenario's actions against its assertions, when it has any.
 * grade-eval exits 1 on a failed assertion. The grade file is still written.
 * That file is what gets read back here.
 */
function gradeScenario({ scenario, scenarioPath, actionsPath, sandboxDir, scenarioOutDir }) {
  if (!scenario.assertions) return null;
  const gradePath = join(scenarioOutDir, "grade.json");
  try {
    runNode("grade-eval.mjs", [
      `--actions=${actionsPath}`,
      `--case=${scenarioPath}`,
      `--sandbox=${sandboxDir}`,
      `--out=${gradePath}`,
    ]);
  } catch {
    // see doc comment: a failing assertion still leaves the grade file.
  }
  return existsSync(gradePath) ? JSON.parse(readFileSync(gradePath, "utf-8")).summary : null;
}

/**
 * Run check-properties.mjs for one result file against its oracle counterpart.
 * Returns the property record, or null when no oracle file exists.
 */
function checkOneProperty({ sandboxDir, file }) {
  const resultPath = join(sandboxDir, "src", file);
  const oraclePath = join(sandboxDir, "oracle", file);
  if (!existsSync(oraclePath)) return null;
  const mutationsPath = `${oraclePath}.mutations.json`;
  const args = [`--original=${oraclePath}`, `--result=${resultPath}`];
  if (existsSync(mutationsPath)) args.push(`--mutations=${mutationsPath}`);
  const propOut = JSON.parse(runNode("check-properties.mjs", args));
  return {
    file,
    syntax_valid: propOut.syntax_valid,
    behavior_score: propOut.behavior_score,
    mutations_fixed: propOut.mutations_fixed,
  };
}

/**
 * Check every result file in a sandbox's src/ against its oracle/
 * counterpart. Files with no oracle counterpart are skipped.
 */
function checkProperties(sandboxDir) {
  const srcDir = join(sandboxDir, "src");
  if (!existsSync(srcDir)) return [];
  return readdirSync(srcDir)
    .map((file) => checkOneProperty({ sandboxDir, file }))
    .filter((entry) => entry !== null);
}

/**
 * Run the full pipeline (sandbox -> eval -> extract -> grade -> properties)
 * for a single scenario file and return its result entry.
 */
function runScenario(scenarioPath, { skill, model, outDir }) {
  const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8"));
  const scenarioOutDir = join(outDir, "scenarios", scenario.id);
  mkdirSync(scenarioOutDir, { recursive: true });

  const sandboxDir = runNode("setup-sandbox.mjs", [`--case=${scenarioPath}`]).trim();
  invokeEval({ sandboxDir, scenario, skill, model, scenarioOutDir });

  const transcriptPath = join(scenarioOutDir, "transcript.jsonl");
  const timingPath = join(scenarioOutDir, "timing.json");
  const timing = existsSync(timingPath) ? JSON.parse(readFileSync(timingPath, "utf-8")) : {};

  const actionsPath = join(scenarioOutDir, "actions.json");
  runNode("extract-actions.mjs", [`--transcript=${transcriptPath}`, `--out=${actionsPath}`]);

  const grade = gradeScenario({ scenario, scenarioPath, actionsPath, sandboxDir, scenarioOutDir });
  const properties = checkProperties(sandboxDir);

  return {
    id: scenario.id,
    grade,
    properties,
    timing: {
      tokens: timing.total_tokens ?? 0,
      duration_ms: timing.duration_ms ?? 0,
    },
  };
}

function runDryRun(scenariosDir) {
  const { count, results } = validateScenariosDir(scenariosDir);
  const invalid = results.filter((r) => !r.valid);
  process.stdout.write(
    `${JSON.stringify({ count, invalid: invalid.length, results }, null, 2)}\n`,
  );
  return invalid.length === 0;
}

function runBenchmark({ scenariosDir, skill, model, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const scenarioFiles = readdirSync(scenariosDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(scenariosDir, f));

  const scenarios = scenarioFiles.map((path) => runScenario(path, { skill, model, outDir }));

  const benchmark = {
    model,
    skill,
    timestamp: new Date().toISOString(),
    run_count: scenarios.length,
    scenarios,
    aggregate: aggregateResults(scenarios),
  };

  writeFileSync(join(outDir, "benchmark.json"), `${JSON.stringify(benchmark, null, 2)}\n`);
  writeFileSync(
    join(outDir, "runs.json"),
    `${JSON.stringify(toCompareRunsFormat(benchmark), null, 2)}\n`,
  );
  return benchmark;
}

function parseCliArgs() {
  return parseArgs({
    options: {
      scenarios: { type: "string" },
      skill: { type: "string" },
      model: { type: "string" },
      out: { type: "string" },
      "dry-run": { type: "boolean" },
    },
  }).values;
}

function runCli() {
  const values = parseCliArgs();

  if (!values.scenarios) {
    process.stderr.write(
      "Usage: benchmark.mjs --scenarios=<dir> --skill=<path> --model=<id> --out=<dir> [--dry-run]\n",
    );
    process.exit(3);
  }

  if (values["dry-run"]) {
    const ok = runDryRun(values.scenarios);
    process.exit(ok ? 0 : 1);
  }

  if (!values.skill || !values.model || !values.out) {
    process.stderr.write(
      "Usage: benchmark.mjs --scenarios=<dir> --skill=<path> --model=<id> --out=<dir> [--dry-run]\n",
    );
    process.exit(3);
  }

  const benchmark = runBenchmark({
    scenariosDir: values.scenarios,
    skill: values.skill,
    model: values.model,
    outDir: values.out,
  });

  process.stdout.write(
    `${JSON.stringify({ scenarios: benchmark.run_count, mean_pass_rate: benchmark.aggregate.mean_pass_rate })}\n`,
  );
}

if (process.argv[1] === _filename) {
  runCli();
}

export { basename };
