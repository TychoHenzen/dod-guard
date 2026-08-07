#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { applyMutations, detectLanguage, MUTATORS } from "./mutate-code.mjs";

const _filename = fileURLToPath(import.meta.url);

const DEFAULT_PROMPT_TEMPLATE =
  "This codebase has quality issues in {file}. Review it, identify the problems, and fix them.";

/**
 * Recursively list every file under a corpus directory, skipping the
 * `.meta.json` sidecars mine-github.mjs writes alongside each source file.
 */
function walkCorpus(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkCorpus(full));
    } else if (entry.isFile() && !entry.name.endsWith(".meta.json")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Read the repo name recorded by mine-github.mjs's `.meta.json` sidecar,
 * falling back to "unknown" when no sidecar exists or it fails to parse.
 */
function repoForFile(filePath) {
  const metaPath = `${filePath}.meta.json`;
  if (!existsSync(metaPath)) return "unknown";
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    return meta.repo ? meta.repo.replace(/[\\/]/g, "-") : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Mutate one source file and add its fixture entries (mutated src, original
 * oracle, mutations oracle) to the given fixtures map.
 */
function addFileFixtures({ filePath, fixtures, seed, mutationsPerFile, mutationTypes }) {
  const source = readFileSync(filePath, "utf-8");
  const language = detectLanguage(filePath);
  const { content: mutated, mutations } = applyMutations(source, {
    count: mutationsPerFile,
    types: mutationTypes,
    language,
    seed,
  });
  const name = basename(filePath);
  fixtures[`src/${name}`] = `inline:${mutated}`;
  fixtures[`oracle/${name}`] = `inline:${source}`;
  fixtures[`oracle/${name}.mutations.json`] = `inline:${JSON.stringify(mutations, null, 2)}`;
  return name;
}

/**
 * Build one eval-case scenario from a group of corpus files (a group of 1
 * unless --scenario-size groups several files into one sandbox).
 */
function buildScenario({ group, promptTemplate }) {
  const fixtures = {};
  const names = group.map(({ filePath, seed, mutationsPerFile, mutationTypes }) =>
    addFileFixtures({ filePath, fixtures, seed, mutationsPerFile, mutationTypes }),
  );
  const repo = repoForFile(group[0].filePath);
  const baseSeed = group[0].seed;
  const id = `${repo}-${names.join("_")}-${baseSeed}`;
  const prompt = promptTemplate.replace(/\{file\}/g, names.join(", "));
  return { id, prompt, fixtures: { files: fixtures } };
}

/**
 * Walk the corpus, group files per --scenario-size, mutate each, and write
 * one eval-case JSON file per group to outDir. Returns the written paths.
 */
export function generateScenarios({
  corpusDir,
  mutationsPerFile = 2,
  mutationTypes = Object.keys(MUTATORS),
  seed = 1,
  promptTemplate = DEFAULT_PROMPT_TEMPLATE,
  outDir,
  scenarioSize = 1,
}) {
  const files = walkCorpus(corpusDir).sort();
  mkdirSync(outDir, { recursive: true });

  const written = [];
  for (let i = 0; i < files.length; i += scenarioSize) {
    const chunk = files.slice(i, i + scenarioSize);
    const group = chunk.map((filePath, offset) => ({
      filePath,
      seed: seed + i + offset,
      mutationsPerFile,
      mutationTypes,
    }));
    const scenario = buildScenario({ group, promptTemplate });
    const outPath = join(outDir, `${scenario.id}.json`);
    writeFileSync(outPath, `${JSON.stringify(scenario, null, 2)}\n`);
    written.push(outPath);
  }
  return written;
}

function parseCliArgs() {
  return parseArgs({
    options: {
      corpus: { type: "string" },
      "mutations-per-file": { type: "string" },
      "mutation-types": { type: "string" },
      seed: { type: "string" },
      "prompt-template": { type: "string" },
      out: { type: "string" },
      "scenario-size": { type: "string" },
    },
  }).values;
}

function runCli() {
  const values = parseCliArgs();
  if (!values.corpus || !values.out) {
    process.stderr.write(
      "Usage: generate-scenarios.mjs --corpus=<dir> --out=<dir> [--mutations-per-file=N] " +
        "[--mutation-types=rename,dead-code,shuffle,bug] [--seed=N] [--prompt-template=<text>] [--scenario-size=N]\n",
    );
    process.exit(3);
  }

  const written = generateScenarios({
    corpusDir: values.corpus,
    mutationsPerFile: values["mutations-per-file"] ? Number.parseInt(values["mutations-per-file"], 10) : 2,
    mutationTypes: values["mutation-types"] ? values["mutation-types"].split(",") : Object.keys(MUTATORS),
    seed: values.seed ? Number.parseInt(values.seed, 10) : 1,
    promptTemplate: values["prompt-template"] ?? DEFAULT_PROMPT_TEMPLATE,
    outDir: values.out,
    scenarioSize: values["scenario-size"] ? Number.parseInt(values["scenario-size"], 10) : 1,
  });

  process.stdout.write(`${JSON.stringify({ scenarios: written.length })}\n`);
}

if (process.argv[1] === _filename) {
  runCli();
}
