#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    before: { type: "string" },
    after: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.before || !values.after) {
  process.stderr.write("Usage: compare-runs.mjs --before=<benchmark.json> --after=<benchmark.json> [--out=<path>]\n");
  process.exit(3);
}

const before = JSON.parse(readFileSync(values.before, "utf-8"));
const after = JSON.parse(readFileSync(values.after, "utf-8"));

function stat(runs, field) {
  const vals = runs.map((r) => r.result?.[field] ?? 0);
  if (vals.length === 0) return { mean: 0, count: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { mean, count: vals.length };
}

const beforeRuns = before.runs ?? [];
const afterRuns = after.runs ?? [];

const caseIds = [...new Set([...beforeRuns.map((r) => r.eval_id), ...afterRuns.map((r) => r.eval_id)])];

const perCase = caseIds.map((id) => {
  const bRuns = beforeRuns.filter((r) => r.eval_id === id);
  const aRuns = afterRuns.filter((r) => r.eval_id === id);
  return {
    eval_id: id,
    eval_name: bRuns[0]?.eval_name ?? aRuns[0]?.eval_name ?? String(id),
    before: { pass_rate: stat(bRuns, "pass_rate"), tokens: stat(bRuns, "tokens"), tool_calls: stat(bRuns, "tool_calls") },
    after: { pass_rate: stat(aRuns, "pass_rate"), tokens: stat(aRuns, "tokens"), tool_calls: stat(aRuns, "tool_calls") },
    delta: {
      pass_rate: stat(aRuns, "pass_rate").mean - stat(bRuns, "pass_rate").mean,
      tokens: stat(aRuns, "tokens").mean - stat(bRuns, "tokens").mean,
      tool_calls: stat(aRuns, "tool_calls").mean - stat(bRuns, "tool_calls").mean,
    },
  };
});

const aggregate = {
  before: { pass_rate: stat(beforeRuns, "pass_rate"), tokens: stat(beforeRuns, "tokens") },
  after: { pass_rate: stat(afterRuns, "pass_rate"), tokens: stat(afterRuns, "tokens") },
  delta: {
    pass_rate: stat(afterRuns, "pass_rate").mean - stat(beforeRuns, "pass_rate").mean,
    tokens: stat(afterRuns, "tokens").mean - stat(beforeRuns, "tokens").mean,
  },
};

const regressed = perCase.some((c) => c.delta.pass_rate < 0);

const comparison = { aggregate, per_case: perCase };
const output = JSON.stringify(comparison, null, 2);

if (values.out) {
  writeFileSync(values.out, output + "\n");
} else {
  process.stdout.write(output + "\n");
}

process.exit(regressed ? 1 : 0);
