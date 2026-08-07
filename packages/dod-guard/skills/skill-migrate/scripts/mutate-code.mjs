#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, dirname, join, basename } from "node:path";
import { parseArgs } from "node:util";

const _filename = fileURLToPath(import.meta.url);

// ---- Seeded PRNG (LCG) ----

export function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function randInt(rng, maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

function pick(rng, list) {
  return list[randInt(rng, list.length)];
}

function shuffleArray(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

// ---- Language detection ----

const LANGUAGE_BY_EXT = {
  ".ts": "javascript",
  ".tsx": "javascript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
};

export function detectLanguage(filePath) {
  return LANGUAGE_BY_EXT[extname(filePath)] ?? "javascript";
}

// ---- Declaration patterns (used by rename + shuffle) ----

const DECLARATION_PATTERNS = {
  javascript: [
    /^(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/,
    /^(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)/,
    /^(export\s+)?class\s+([A-Za-z_$][\w$]*)/,
  ],
  python: [/^def\s+([A-Za-z_]\w*)/, /^class\s+([A-Za-z_]\w*)/],
  rust: [
    /^(pub\s+)?(async\s+)?fn\s+([A-Za-z_]\w*)/,
    /^(pub\s+)?struct\s+([A-Za-z_]\w*)/,
    /^(pub\s+)?enum\s+([A-Za-z_]\w*)/,
    /^let\s+(mut\s+)?([A-Za-z_]\w*)/,
  ],
  go: [/^func\s+(\([^)]*\)\s*)?([A-Za-z_]\w*)/, /^var\s+([A-Za-z_]\w*)/, /^type\s+([A-Za-z_]\w*)/],
};

function declarationPatterns(language) {
  return DECLARATION_PATTERNS[language] ?? DECLARATION_PATTERNS.javascript;
}

function findDeclarations(lines, language) {
  const patterns = declarationPatterns(language);
  const results = [];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[match.length - 1];
        if (name) results.push({ line: index, name });
        break;
      }
    }
  });
  return results;
}

// ---- rename ----

function swapCamelSegments(name) {
  const segments = name.split(/(?=[A-Z])/);
  if (segments.length < 2) return `${name}X`;
  return [segments[1], segments[0], ...segments.slice(2)].join("");
}

function renameIdentifier(name, rng) {
  const strategies = [(n) => `${n}V2`, (n) => `${n}_alt`, swapCamelSegments];
  const candidate = pick(rng, strategies)(name);
  return candidate === name ? `${name}Renamed` : candidate;
}

function mutateRename(content, language, rng) {
  const lines = content.split("\n");
  const declarations = findDeclarations(lines, language);
  if (declarations.length === 0) return null;
  const target = pick(rng, declarations);
  const newName = renameIdentifier(target.name, rng);
  const pattern = new RegExp(`\\b${escapeRegExp(target.name)}\\b`, "g");
  const mutated = lines.map((line) => line.replace(pattern, newName)).join("\n");
  return {
    content: mutated,
    mutation: {
      type: "rename",
      line: target.line + 1,
      before: target.name,
      after: newName,
      description: `Renamed '${target.name}' to '${newName}'`,
    },
  };
}

// ---- dead-code ----

const DEAD_CODE_BY_LANGUAGE = {
  javascript: "if (false) { /* dead */ }",
  python: "if False:\n    pass  # dead",
  rust: "if false { /* dead */ }",
  go: "if false {\n\t\t// dead\n\t}",
};

function mutateDeadCode(content, language, rng) {
  const lines = content.split("\n");
  const insertAt = randInt(rng, lines.length + 1);
  const snippet = DEAD_CODE_BY_LANGUAGE[language] ?? DEAD_CODE_BY_LANGUAGE.javascript;
  const inserted = [...lines.slice(0, insertAt), snippet, ...lines.slice(insertAt)];
  return {
    content: inserted.join("\n"),
    mutation: {
      type: "dead-code",
      line: insertAt + 1,
      before: "",
      after: snippet,
      description: `Inserted unreachable branch at line ${insertAt + 1}`,
    },
  };
}

// ---- shuffle ----

function splitTopLevelBlocks(lines, language) {
  const patterns = declarationPatterns(language);
  const startIndices = [];
  lines.forEach((line, index) => {
    if (/^\S/.test(line) && patterns.some((pattern) => pattern.test(line))) {
      startIndices.push(index);
    }
  });
  if (startIndices.length < 2) return null;
  const preamble = lines.slice(0, startIndices[0]);
  const blocks = startIndices.map((start, i) => {
    const end = i + 1 < startIndices.length ? startIndices[i + 1] : lines.length;
    const blockLines = lines.slice(start, end);
    const decl = findDeclarations(blockLines, language)[0];
    return { name: decl?.name ?? `block${i}`, lines: blockLines };
  });
  return { preamble, blocks };
}

function dependsOn(blocks, a, b) {
  return a !== b && new RegExp(`\\b${escapeRegExp(blocks[b].name)}\\b`).test(blocks[a].lines.join("\n"));
}

function dependencyOrder(blocks, rng) {
  const remaining = new Set(blocks.map((_, i) => i));
  const order = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((i) => ![...remaining].some((j) => dependsOn(blocks, i, j)));
    const pool = ready.length > 0 ? ready : [...remaining];
    const chosen = pick(rng, pool);
    order.push(chosen);
    remaining.delete(chosen);
  }
  return order;
}

function ensureReordered(order, blocks) {
  const isIdentity = order.every((value, index) => value === index);
  if (!isIdentity) return order;
  for (let i = 0; i < blocks.length - 1; i++) {
    const j = i + 1;
    if (!dependsOn(blocks, i, j) && !dependsOn(blocks, j, i)) {
      const swapped = [...order];
      [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
      return swapped;
    }
  }
  return null;
}

function mutateShuffle(content, language, rng) {
  const lines = content.split("\n");
  const split = splitTopLevelBlocks(lines, language);
  if (!split || split.blocks.length < 2) return null;
  const order = ensureReordered(dependencyOrder(split.blocks, rng), split.blocks);
  if (!order) return null;
  const reorderedLines = order.flatMap((i) => split.blocks[i].lines);
  return {
    content: [...split.preamble, ...reorderedLines].join("\n"),
    mutation: {
      type: "shuffle",
      line: split.preamble.length + 1,
      before: split.blocks.map((b) => b.name).join(", "),
      after: order.map((i) => split.blocks[i].name).join(", "),
      description: "Reordered top-level declarations while preserving detected dependencies",
    },
  };
}

// ---- bug ----

function applyAtMatch(content, regex, transform, description) {
  const match = regex.exec(content);
  if (!match) return null;
  const before = match[0];
  const after = transform(match);
  if (after === before) return null;
  return {
    content: content.slice(0, match.index) + after + content.slice(match.index + before.length),
    mutation: {
      type: "bug",
      line: lineNumberAt(content, match.index),
      before,
      after,
      description,
    },
  };
}

function bugLoopBound(content, language) {
  if (language === "python") return null;
  const regex = /for\s*\([^;)]*;\s*[\w.[\]]+\s*(<=|<)\s*[\w.[\]]+\s*;/;
  return applyAtMatch(
    content,
    regex,
    (m) => m[0].replace(m[1], m[1] === "<" ? "<=" : "<"),
    "Flipped loop bound comparison operator",
  );
}

function bugRangeOffByOne(content, language) {
  if (language !== "python") return null;
  const regex = /range\((\w+)\)/;
  return applyAtMatch(content, regex, (m) => `range(${m[1]} + 1)`, "Introduced off-by-one in range bound");
}

function bugEqualityFlip(content, language) {
  const regex = language === "javascript" ? /(===|!==)/ : /(==|!=)/;
  const flips = { "===": "!==", "!==": "===", "==": "!=", "!=": "==" };
  return applyAtMatch(content, regex, (m) => flips[m[1]], "Swapped equality operator");
}

function bugSwapArgs(content) {
  const regex = /\(([A-Za-z_$][\w$]*),\s*([A-Za-z_$][\w$]*)/;
  const preview = regex.exec(content);
  if (!preview) return null;
  return applyAtMatch(
    content,
    regex,
    (m) => `(${m[2]}, ${m[1]}`,
    `Swapped adjacent arguments '${preview[1]}' and '${preview[2]}'`,
  );
}

function bugRemoveNullCheck(content, language) {
  if (language !== "javascript") return null;
  const regex = /if\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{\n?([^{}]*)\}/;
  const preview = regex.exec(content);
  if (!preview) return null;
  const [, name, body] = preview;
  if (!new RegExp(`\\b${escapeRegExp(name)}\\.`).test(body)) return null;
  return applyAtMatch(content, regex, () => body.trim(), `Removed null check before accessing '${name}'`);
}

const BUG_STRATEGIES = [bugLoopBound, bugRangeOffByOne, bugEqualityFlip, bugSwapArgs, bugRemoveNullCheck];

function mutateBug(content, language, rng) {
  const order = shuffleArray([...BUG_STRATEGIES], rng);
  for (const strategy of order) {
    const result = strategy(content, language);
    if (result) return result;
  }
  return null;
}

// ---- driver ----

export const MUTATORS = {
  rename: mutateRename,
  "dead-code": mutateDeadCode,
  shuffle: mutateShuffle,
  bug: mutateBug,
};

export function applyMutations(source, options = {}) {
  const { count = 3, types = Object.keys(MUTATORS), language = "javascript", seed = 1 } = options;
  const rng = seededRandom(seed);
  const activeTypes = types.filter((type) => MUTATORS[type]);
  let content = source;
  const mutations = [];
  const maxAttempts = Math.max(count, 1) * Math.max(activeTypes.length, 1) * 2;
  let attempts = 0;
  while (mutations.length < count && attempts < maxAttempts && activeTypes.length > 0) {
    attempts++;
    const type = pick(rng, activeTypes);
    const result = MUTATORS[type](content, language, rng);
    if (result) {
      content = result.content;
      mutations.push(result.mutation);
    }
  }
  return { content, mutations };
}

// ---- CLI ----

function parseCliArgs() {
  return parseArgs({
    options: {
      input: { type: "string" },
      count: { type: "string" },
      types: { type: "string" },
      out: { type: "string" },
      seed: { type: "string" },
    },
  }).values;
}

function mutationsSidecarPath(outPath) {
  return join(dirname(outPath), `${basename(outPath)}.mutations.json`);
}

function runCli() {
  const values = parseCliArgs();
  if (!values.input || !values.out) {
    process.stderr.write(
      "Usage: mutate-code.mjs --input=<path> --out=<path> [--count=N] [--types=rename,dead-code,shuffle,bug] [--seed=N]\n",
    );
    process.exit(3);
  }

  const source = readFileSync(values.input, "utf-8");
  const language = detectLanguage(values.input);
  const count = values.count ? Number.parseInt(values.count, 10) : 3;
  const types = values.types ? values.types.split(",") : Object.keys(MUTATORS);
  const seed = values.seed ? Number.parseInt(values.seed, 10) : 1;

  const { content, mutations } = applyMutations(source, { count, types, language, seed });
  writeFileSync(values.out, content);
  writeFileSync(mutationsSidecarPath(values.out), `${JSON.stringify(mutations, null, 2)}\n`);
}

if (process.argv[1] === _filename) {
  runCli();
}
