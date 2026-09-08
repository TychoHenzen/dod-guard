import assert from "node:assert/strict";
import { test } from "node:test";
import { runFossilCli } from "./index.js";
import type { NormalizedAnalysisOptions } from "./types.js";
import { optionsFor, reportFor } from "./index.test-support.js";

async function runDefaultAnalyses() {
  const calls: Array<{
    repositoryPath: string;
    options: NormalizedAnalysisOptions;
  }> = [];
  let invocation = 0;
  const dependencies = {
    cwd: () => "C:/repositories/default",
    stdout: () => undefined,
    analyze: async (
      repositoryPath: string,
      options: NormalizedAnalysisOptions,
    ) => {
      calls.push({ repositoryPath, options: structuredClone(options) });
      if (invocation === 0) {
        (options.extensions as string[]).push("mutated");
        (options.exclude as string[]).push("mutated");
      }
      invocation += 1;
      return reportFor(options);
    },
  };

  await runFossilCli(["node", "fossil", "analyze"], dependencies);
  await runFossilCli(
    ["node", "fossil", "analyze", "C:/repositories/explicit"],
    dependencies,
  );
  return calls;
}

test(
  "passes normalized defaults and the current directory to analyze",
  async () => {
  const calls = await runDefaultAnalyses();
  assert.deepEqual(calls, [
    {
      repositoryPath: "C:/repositories/default",
      options: optionsFor(),
    },
    {
      repositoryPath: "C:/repositories/explicit",
      options: optionsFor(),
    },
  ]);
});
