#!/usr/bin/env node
// Corpus plus pairs, in one pass. Reads every tracked doc, splits it into
// claim units, and scores candidate conflict pairs. Writes the result to a
// file (or stdout with --json) for a judge subagent to work through, one
// pair at a time.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listDocFiles, splitClaims } from "./lib/doc-corpus.mjs";
import { buildPairs } from "./lib/pair-index.mjs";

const DEFAULT_THRESHOLD = 0.35;
const DEFAULT_MAX_PER_CLAIM = 3;
const DEFAULT_MIN_TOKENS = 6;
const DEFAULT_OUT = ".doc-reconcile/candidates.json";

const USAGE = [
  "Usage: node scan-docs.mjs [options]",
  "",
  "  --root=<path>          repository to scan (default: cwd)",
  "  --threshold=<n>        minimum pair score (default: 0.35)",
  "  --max-per-claim=<n>    pair cap per claim (default: 3)",
  "  --min-tokens=<n>       drop claims with fewer content tokens (default: 6)",
  "  --out=<path>           output file, relative to root",
  "                         (default: .doc-reconcile/candidates.json)",
  "  --json                 print to stdout instead of writing a file",
  "  --limit=<n>            keep only the top N pairs",
  "",
  "Exit codes: 0 ran, 3 usage error.",
].join("\n");

const KNOWN_FLAGS = new Set(["root", "threshold", "max-per-claim", "min-tokens", "out", "json", "limit"]);

function parseFlag(item) {
  const match = /^--([\w-]+)(?:=(.*))?$/.exec(item);
  if (!match || !KNOWN_FLAGS.has(match[1])) {
    throw new Error(`unknown option: ${item}`);
  }
  const [, key, value] = match;
  return { key, value: value ?? true };
}

function parseArgs(argv) {
  const args = { json: false };
  for (const item of argv) {
    const { key, value } = parseFlag(item);
    args[key] = value;
  }
  return args;
}

function parseNumber(raw, flag) {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`--${flag} must be a number, got ${raw}`);
  }
  return value;
}

// `existsSyncFn` is injected so the test can fake a root without touching
// the real filesystem.
function readOptions(args, existsSyncFn) {
  const root = resolve(String(args.root ?? "."));
  if (!existsSyncFn(root)) {
    throw new Error(`--root is not a directory: ${root}`);
  }
  return {
    root,
    threshold: parseNumber(args.threshold, "threshold") ?? DEFAULT_THRESHOLD,
    maxPerClaim: parseNumber(args["max-per-claim"], "max-per-claim") ?? DEFAULT_MAX_PER_CLAIM,
    minTokens: parseNumber(args["min-tokens"], "min-tokens") ?? DEFAULT_MIN_TOKENS,
    out: String(args.out ?? DEFAULT_OUT),
    json: args.json === true,
    limit: parseNumber(args.limit, "limit"),
  };
}

function readClaims(root, run, readFileFn) {
  const claims = [];
  for (const file of listDocFiles(root, run)) {
    const text = readFileFn(root, file);
    claims.push(...splitClaims(file, text));
  }
  return claims;
}

function buildResult(options, claims, pairs) {
  const limited = options.limit === undefined ? pairs : pairs.slice(0, options.limit);
  const docCount = new Set(claims.map((claim) => claim.file)).size;
  return {
    generatedAt: new Date().toISOString(),
    root: options.root,
    docCount,
    claimCount: claims.length,
    pairCount: limited.length,
    options: {
      threshold: options.threshold,
      maxPerClaim: options.maxPerClaim,
      minTokens: options.minTokens,
      limit: options.limit ?? null,
    },
    pairs: limited,
  };
}

function writeResult(options, result) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const outPath = resolve(options.root, options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
}

function defaultReadFile(root, file) {
  return readFileSync(resolve(root, file), "utf8");
}

// `deps` lets the test swap in a fake git runner and a fake file reader so
// it never touches this repository's real files. Defaults reach the real
// filesystem and the real git binary.
export function run(argv, deps = {}) {
  const existsSyncFn = deps.existsSync ?? existsSync;
  const readFileFn = deps.readFile ?? defaultReadFile;
  let options;
  try {
    options = readOptions(parseArgs(argv), existsSyncFn);
  } catch (err) {
    process.stderr.write(`${err.message}\n${USAGE}\n`);
    return 3;
  }
  const claims = readClaims(options.root, deps.gitRun, readFileFn);
  const pairs = buildPairs(claims, {
    threshold: options.threshold,
    maxPerClaim: options.maxPerClaim,
    minTokens: options.minTokens,
  });
  writeResult(options, buildResult(options, claims, pairs));
  return 0;
}

const _filename = fileURLToPath(import.meta.url);

if (process.argv[1] === _filename) {
  process.exit(run(process.argv.slice(2)));
}
