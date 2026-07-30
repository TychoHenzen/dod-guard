// Cross-file rules: reachability of exported symbols and copy-paste blocks.
//
// These need every file's stripped code at once, so they run after the
// per-file pass rather than inside it.

import { DUPLICATE_WINDOW, isEntryPath } from "./config.mjs";
import { lineAt } from "./offsets.mjs";

const TS_DECL = "class|interface|enum|type|function|const|let|var";
const TS_EXPORT = new RegExp(
  `export\\s+(?:default\\s+)?(?:async\\s+)?(?:abstract\\s+)?(?:${TS_DECL})\\s+([A-Za-z_$][\\w$]*)`,
  "g",
);
const CS_MODIFIERS = "static|abstract|sealed|partial|readonly";
const CS_EXPORT = new RegExp(
  `public\\s+(?:(?:${CS_MODIFIERS})\\s+)*(?:class|interface|struct|enum|record)\\s+(\\w+)`,
  "g",
);

/** What counts as a publicly reachable symbol, per language. */
const EXPORT_PATTERNS = {
  ts: [TS_EXPORT],
  cs: [CS_EXPORT],
  rs: [/pub(?:\([^)]*\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|const|static|type)\s+(\w+)/g],
  go: [/func\s+([A-Z]\w*)\s*\(/g, /type\s+([A-Z]\w*)\s/g],
  java: [/public\s+(?:static\s+|abstract\s+|final\s+)*(?:class|interface|enum|record)\s+(\w+)/g],
  py: [/^(?:async\s+)?def\s+([a-zA-Z]\w*)/gm, /^class\s+([A-Za-z]\w*)/gm],
};

/** `export { a, b as c }` — the re-export form the direct patterns miss. */
const EXPORT_BLOCK = /export\s*\{([^}]*)\}/g;

function namesFromBlock(code) {
  const names = [];
  EXPORT_BLOCK.lastIndex = 0;
  let match = EXPORT_BLOCK.exec(code);
  while (match !== null) {
    for (const part of match[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/).pop();
      if (alias && /^[A-Za-z_$][\w$]*$/.test(alias)) names.push(alias);
    }
    match = EXPORT_BLOCK.exec(code);
  }
  return names;
}

function exportsOf(file, scan) {
  const patterns = EXPORT_PATTERNS[file.lang] ?? [];
  const found = new Map();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(scan.code);
    while (match !== null) {
      found.set(match[1], lineAt(scan.starts, match.index));
      match = pattern.exec(scan.code);
    }
  }
  if (file.lang === "ts") {
    for (const name of namesFromBlock(scan.code)) {
      if (!found.has(name)) found.set(name, 1);
    }
  }
  return [...found].map(([name, line]) => ({ name, line }));
}

function manifestHits(pattern, manifests) {
  let hits = 0;
  for (const manifest of manifests) {
    hits += manifest.text.match(pattern)?.length ?? 0;
  }
  return hits;
}

/**
 * `corpus` is `{ files, scans, manifests }`. `ownFile` is excluded, so a symbol
 * referencing itself does not keep itself alive.
 */
function referenceCounts(name, corpus, ownFile) {
  const pattern = new RegExp(`\\b${name}\\b`, "g");
  let prod = manifestHits(pattern, corpus.manifests);
  let test = 0;
  for (const file of corpus.files) {
    if (file.rel === ownFile) continue;
    const hits = corpus.scans.get(file.rel).code.match(pattern);
    if (!hits) continue;
    if (file.isTest) test += hits.length;
    else prod += hits.length;
  }
  return { prod, test };
}

/**
 * Flag exports nothing else uses, and exports only tests use. Both are dead
 * weight: the first has no callers at all, the second exists to be tested.
 *
 * `manifests` are non-code reference evidence collected from the scan root.
 * See `MANIFEST_EXTS` in config.mjs for the file types: scene files, project
 * files, config and markup. A hit there counts as a production reference.
 * Scene and config wiring is real usage, not test usage. The manifest itself
 * is never scanned for violations and never treated as a file in the output.
 */
export function checkReachability(files, scans, config, manifests = []) {
  const out = [];
  const corpus = { files, scans, manifests };
  for (const file of files) {
    if (file.isTest || isEntryPath(file.rel)) continue;
    for (const symbol of exportsOf(file, scans.get(file.rel))) {
      const { prod, test } = referenceCounts(symbol.name, corpus, file.rel);
      if (prod > 0) continue;
      const rule = test > 0 ? "test-only-export" : "dead-export";
      const message =
        test > 0
          ? `${symbol.name} is only referenced by tests — delete it and its tests`
          : `${symbol.name} is exported but never referenced anywhere`;
      out.push({
        file: file.rel,
        line: symbol.line,
        rule,
        severity: config.presence[rule],
        message,
        metric: 1,
      });
    }
  }
  return out;
}

/** Lines that carry no meaning on their own and would create noise hits. */
const TRIVIAL_LINE = /^[\s{}()[\];,]*$/;
const COMMENT_LINE = /^\s*(\/\/|#|\*|\/\*)/;
/** Distinct lines a window needs before it counts as real duplication. */
const MIN_DISTINCT_LINES = 4;

/**
 * Duplication runs on raw lines, not stripped code. Stripping blanks out
 * string literals, which makes every row of a lookup table look identical and
 * produces a flood of false duplicates.
 */
function normalizeLines(file) {
  return file.lines.map((line) => (COMMENT_LINE.test(line) ? "" : line.trim().replace(/\s+/g, " ")));
}

function windowsOf(file) {
  const lines = normalizeLines(file);
  const found = [];
  for (let i = 0; i + DUPLICATE_WINDOW <= lines.length; i += 1) {
    const slice = lines.slice(i, i + DUPLICATE_WINDOW);
    if (slice.some((line) => TRIVIAL_LINE.test(line))) continue;
    if (new Set(slice).size < MIN_DISTINCT_LINES) continue;
    found.push({ key: slice.join("\n"), file: file.rel, line: i + 1 });
  }
  return found;
}

function firstPerFile(group) {
  const seen = new Set();
  return group.filter((hit) => {
    const key = `${hit.file}:${Math.floor(hit.line / DUPLICATE_WINDOW)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bucketWindows(files) {
  const buckets = new Map();
  for (const file of files) {
    for (const hit of windowsOf(file)) {
      const bucket = buckets.get(hit.key) ?? [];
      bucket.push(hit);
      buckets.set(hit.key, bucket);
    }
  }
  return buckets;
}

function emitGroup(hits, config, reported, out) {
  const bounds = config.thresholds["duplicate-block"];
  const severity = bounds.error !== null && hits.length > bounds.error ? "error" : "warn";
  const where = hits.map((hit) => `${hit.file}:${hit.line}`).join(", ");
  for (const hit of hits) {
    const key = `${hit.file}:${hit.line}`;
    if (reported.has(key)) continue;
    reported.add(key);
    out.push({
      file: hit.file,
      line: hit.line,
      rule: "duplicate-block",
      severity,
      message: `${DUPLICATE_WINDOW}-line block duplicated at ${where}`,
      metric: hits.length,
    });
  }
}

/** Report identical N-line blocks appearing in two or more places. */
export function checkDuplication(files, config) {
  const out = [];
  const reported = new Set();
  for (const group of bucketWindows(files).values()) {
    const hits = firstPerFile(group);
    if (hits.length >= 2) emitGroup(hits, config, reported, out);
  }
  return out;
}
