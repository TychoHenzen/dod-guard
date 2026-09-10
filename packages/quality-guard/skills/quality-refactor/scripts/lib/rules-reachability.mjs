import { isEntryPath } from "./config.mjs";
import { lineAt } from "./offsets.mjs";
import { referenceCounts } from "./rules-reachability-evidence.mjs";
import { EXPORT_PATTERNS } from "./rules-reachability-exports.mjs";
const EXPORT_BLOCK = /export\s*\{([^}]*)\}/g;
function namesFromBlock(code) {
  const names = [];
  EXPORT_BLOCK.lastIndex = 0;
  let match = EXPORT_BLOCK.exec(code);
  while (match !== null) {
    for (const part of match[1].split(",")) {
      const alias = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (alias && /^[A-Za-z_$][\w$]*$/.test(alias)) names.push(alias);
    }
    match = EXPORT_BLOCK.exec(code);
  }
  return names;
}
function matchesFor(pattern, code) {
  const matches = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match !== null) {
    matches.push(match);
    match = pattern.exec(code);
  }
  return matches;
}
function directExports(file, scan) {
  const found = new Map();
  for (const pattern of EXPORT_PATTERNS[file.lang] ?? []) {
    for (const match of matchesFor(pattern, scan.code)) {
      const offset = match.index + match[0].lastIndexOf(match[1]);
      found.set(match[1], { line: lineAt(scan.starts, match.index), offset });
    }
  }
  return found;
}
function addReexports(found, scan) {
  for (const name of namesFromBlock(scan.code)) {
    if (!found.has(name)) found.set(name, { line: 1, offset: -1 });
  }
  return found;
}
function exportsOf(file, scan) {
  const found = directExports(file, scan);
  return [...(file.lang === "ts" ? addReexports(found, scan) : found)].map(
    ([name, info]) => ({ name, ...info }),
  );
}
function violationForSymbol({ file, corpus, config, symbol }) {
  const { prod, test } = referenceCounts(symbol.name, corpus, {
    file: file.rel,
    offset: symbol.offset,
  });
  if (prod > 0) return null;
  const rule = test > 0 ? "test-only-export" : "dead-export";
  const message =
    test > 0
      ? `${symbol.name} is only referenced by tests ` +
        "\u2014 delete it and its tests"
      : `${symbol.name} is exported but never referenced anywhere`;
  return {
    file: file.rel,
    line: symbol.line,
    rule,
    severity: config.presence[rule],
    message,
    metric: 1,
  };
}
function violationsForFile(file, corpus, config) {
  if (file.isTest || isEntryPath(file.rel)) return [];
  return exportsOf(file, corpus.scans.get(file.rel))
    .map((symbol) => violationForSymbol({ file, corpus, config, symbol }))
    .filter((violation) => violation !== null);
}

export function checkReachability({ files, scans, config, manifests = [] }) {
  const corpus = { files, scans, manifests };
  return files.flatMap((file) => violationsForFile(file, corpus, config));
}
