// Cross-file rules: reachability of exported symbols and copy-paste blocks.
//
// These need every file's stripped code at once, so they run after the
// per-file pass rather than inside it.

import { DUPLICATE_WINDOW, isEntryPath } from "./config.mjs";
import { lineAt } from "./offsets.mjs";
import { inTestRegion } from "./rules-file.mjs";

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

/** `export { a, b as c }` - the re-export form the direct patterns miss. */
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
      // The name's own offset, not the match's. A match can start earlier,
      // at a modifier keyword such as `pub` or `export`. Rust needs this
      // exact offset to read the declaration as not a reference to itself
      // in referenceCounts below. lastIndexOf is safe here, because no
      // keyword in these patterns equals the captured name.
      const offset = match.index + match[0].lastIndexOf(match[1]);
      found.set(match[1], { line: lineAt(scan.starts, match.index), offset });
      match = pattern.exec(scan.code);
    }
  }
  if (file.lang === "ts") {
    for (const name of namesFromBlock(scan.code)) {
      if (!found.has(name)) found.set(name, { line: 1, offset: -1 });
    }
  }
  return [...found].map(([name, info]) => ({ name, ...info }));
}

function manifestHits(pattern, manifests) {
  let hits = 0;
  for (const manifest of manifests) {
    hits += manifest.text.match(pattern)?.length ?? 0;
  }
  return hits;
}

/** Whether the match at `offset` in `file` is the symbol's own declaration. */
function isOwnDeclarationMatch(file, own, offset) {
  return file.rel === own.file && offset === own.offset;
}

/** Interpolation identifiers in `scan` named `name` - always a use, never a declaration. */
function capturesNamed(scan, name) {
  const interpolations = scan.interpolations ?? [];
  return interpolations.filter((id) => id.name === name);
}

/**
 * A capture identifier's line, translated to an offset `inTestRegion` can
 * use. Strip carries a capture's line, not its offset, so the start of that
 * line stands in for it. That is close enough to place the capture inside
 * or outside a `#[cfg(test)]` region, because such a region runs many lines
 * deep.
 */
function captureOffset(scan, id) {
  const starts = scan.starts ?? [];
  return starts[id.line - 1] ?? 0;
}

/** Matches for `pattern` in `scan.code`, or 0 when there are none. */
function matchCount(scan, pattern) {
  const hits = scan.code.match(pattern);
  return hits === null ? 0 : hits.length;
}

/**
 * One Rust file's contribution to `referenceCounts`. Every match is counted
 * on its own rather than by file, because a `.rs` file can hold both a real
 * production caller and a `#[cfg(test)]` caller of one symbol.
 *
 * The symbol's own declaration match is excluded, so a symbol never counts
 * itself as a reference. Every other match counts as test evidence when it
 * falls inside a cfg(test) region, and as production evidence otherwise.
 * A format capture naming `own.name` counts the same way, by the line it
 * sits on rather than a match offset. A capture is always a use, never the
 * declaration, so it needs no exclusion.
 */
function rustFileEvidence(pattern, entry, own) {
  const { file, scan } = entry;
  const regions = scan.testRegions ?? [];
  const offsets = [...scan.code.matchAll(pattern)].map((found) => found.index);
  const external = offsets.filter((offset) => !isOwnDeclarationMatch(file, own, offset));
  const captures = capturesNamed(scan, own.name);
  const codeTest = external.filter((offset) => inTestRegion(regions, offset)).length;
  const captureTest = captures.filter((id) => inTestRegion(regions, captureOffset(scan, id))).length;
  const test = codeTest + captureTest;
  return { prod: external.length + captures.length - test, test };
}

/**
 * One file's contribution to `referenceCounts`. For every language but
 * Rust, `own.file` is skipped outright. A symbol's own declaration always
 * contains its own name, so that skip stops it counting as a reference to
 * itself. The whole-file skip is also a fast path: one string compare
 * rather than a region lookup per match. Every other language keeps it.
 *
 * Rust cannot take that shortcut. Its cfg(test) module usually sits in the
 * very file it tests. That module's references are the ones
 * test-only-export needs to see. Skipping the whole file would hide them,
 * the same way it would hide a real production caller in that file. So a
 * `.rs` file goes to `rustFileEvidence` instead, `own.file` included, and
 * every match is counted by position.
 *
 * A C# interpolated string reads `own.name` the same way a plain-code match
 * would, so a capture counts alongside `hits` here too.
 */
function fileEvidence(pattern, entry, own) {
  const { file, scan } = entry;
  if (file.lang === "rs") return rustFileEvidence(pattern, entry, own);
  if (file.rel === own.file) return { prod: 0, test: 0 };
  return plainFileEvidence(pattern, entry, own);
}

/** `fileEvidence`'s count for a non-Rust, non-own file: code matches plus format-capture reads. */
function plainFileEvidence(pattern, entry, own) {
  const { file, scan } = entry;
  const total = matchCount(scan, pattern) + capturesNamed(scan, own.name).length;
  if (total === 0) return { prod: 0, test: 0 };
  if (file.isTest) return { prod: 0, test: total };
  return { prod: total, test: 0 };
}

/**
 * `corpus` is `{ files, scans, manifests }`. `own` holds the declaring
 * file's path and the symbol's own declaration offset in it. `fileEvidence`
 * also needs the symbol's name, to match a format capture against it. `own`
 * carries that too, folded in here rather than added as a fourth parameter
 * on every evidence function.
 */
function referenceCounts(name, corpus, own) {
  const pattern = new RegExp(`\\b${name}\\b`, "g");
  const ownSymbol = { ...own, name };
  let prod = manifestHits(pattern, corpus.manifests);
  let test = 0;
  for (const file of corpus.files) {
    const scan = corpus.scans.get(file.rel);
    const evidence = fileEvidence(pattern, { file, scan }, ownSymbol);
    prod += evidence.prod;
    test += evidence.test;
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
      const { prod, test } = referenceCounts(symbol.name, corpus, { file: file.rel, offset: symbol.offset });
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
/**
 * An import is forced by the language, not chosen by a design. Two modules
 * that pull the same names are not duplicated logic. Every MCP entry point
 * in this monorepo opens with the same six lines.
 */
const IMPORT_LINE = /^\s*(import|export)\b[^;]*\bfrom\b/;
/** Distinct lines a window needs before it counts as real duplication. */
const MIN_DISTINCT_LINES = 4;

/**
 * Duplication runs on raw lines, not stripped code. Stripping blanks out
 * string literals, which makes every row of a lookup table look identical and
 * produces a flood of false duplicates.
 */
function normalizeLines(file) {
  return file.lines.map((line) => {
    if (COMMENT_LINE.test(line) || IMPORT_LINE.test(line)) return "";
    return line.trim().replace(/\s+/g, " ");
  });
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
