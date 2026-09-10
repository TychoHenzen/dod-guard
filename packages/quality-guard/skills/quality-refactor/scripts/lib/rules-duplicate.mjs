import { DUPLICATE_WINDOW } from "./config.mjs";

const TRIVIAL_LINE = /^[\s{}()[\];,]*$/;
const COMMENT_LINE = /^\s*(\/\/|#|\*|\/\*)/;
const IMPORT_LINE = /^\s*(import|export)\b[^;]*\bfrom\b/;
const MIN_DISTINCT_LINES = 4;

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

function emitGroup({ hits, config, reported, out }) {
  const bounds = config.thresholds["duplicate-block"];
  const severity =
    bounds.error !== null && hits.length > bounds.error ? "error" : "warn";
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

export function checkDuplication(files, config) {
  const out = [];
  const reported = new Set();
  for (const group of bucketWindows(files).values()) {
    const hits = firstPerFile(group);
    if (hits.length >= 2) emitGroup({ hits, config, reported, out });
  }
  return out;
}
