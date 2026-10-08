// C# partial types measured as one unit across their sibling files.

import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { IGNORED_FILE_PATTERNS, severityFor } from "./config.mjs";
import { strip } from "./strip.mjs";
import { push } from "./violations.mjs";
import { readText } from "./walk.mjs";

/** Compiler and source-generator output that legitimately shares a partial. */
const GENERATED_PARTIAL = /\.g(?:\.i)?\.cs$/i;
const PARTIAL_PREFIX = /\bpartial\s+(?:record\s+)?$/;
const NAMESPACE = /\bnamespace\s+([\w.]+)/;

/** Modifiers may sit on earlier lines, so read back to the previous statement. */
function partialTypes(code, types) {
  return types.filter((type) => {
    const start = Math.max(...[";", "{", "}"].map((end) => code.lastIndexOf(end, type.offset)));
    return PARTIAL_PREFIX.test(code.slice(start + 1, type.offset));
  });
}

function namespaceOf(code) {
  return NAMESPACE.exec(code)?.[1] ?? null;
}

function declares(code, name) {
  const pattern = new RegExp(
    String.raw`\bpartial\s+(?:record\s+)?(?:class|struct|interface|record)\s+` +
      name +
      String.raw`\b`,
  );
  return pattern.test(code);
}

function isHandwritten(name) {
  if (!name.toLowerCase().endsWith(".cs")) return false;
  if (GENERATED_PARTIAL.test(name)) return false;
  return !IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function siblingSources(path) {
  let names;
  try {
    names = readdirSync(dirname(path));
  } catch {
    return [];
  }
  const own = basename(path);
  return names
    .filter((name) => name !== own && isHandwritten(name))
    .map((name) => readText(join(dirname(path), name)))
    .filter((source) => source !== null);
}

/**
 * A partial type split across hand-written files in one directory is one class
 * to its readers. Measure every declaring file together so that moving members
 * into another `partial` file does not hide a long class from `file-length`.
 */
export function checkPartialTypes({ file, config, code, types, out }) {
  if (file.lang !== "cs" || !file.path) return;
  if (!isHandwritten(basename(file.path))) return;
  const partials = partialTypes(code, types);
  if (partials.length === 0) return;
  const namespace = namespaceOf(code);
  const siblings = siblingSources(file.path)
    .map((source) => ({
      code: strip(source, "cs").code,
      lines: source.split(/\r?\n/).length,
    }))
    .filter((sibling) => namespaceOf(sibling.code) === namespace);
  for (const type of partials) {
    const parts = siblings.filter((sibling) => declares(sibling.code, type.name));
    if (parts.length === 0) continue;
    const total = parts.reduce((sum, part) => sum + part.lines, file.lines.length);
    push({
      out,
      file,
      line: type.line,
      rule: "partial-type-length",
      severity: severityFor(config, "partial-type-length", total),
      message:
        `partial ${type.kind} ${type.name} spans ${parts.length + 1} files ` +
        `totaling ${total} lines`,
      metric: total,
    });
  }
}
