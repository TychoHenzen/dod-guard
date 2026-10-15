// Biome configs are written into temp directories at test time: a tracked
// fixture biome.json inside the repository would be read by Biome itself as
// a nested config.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { createWidthResolver } from "../../../../../skills/quality-refactor/scripts/lib/formatter-width.mjs";
import { scan } from "../../../../../skills/quality-refactor/scripts/quality-scan-run.mjs";

export const FALLBACK = { width: null, source: "default" };
export const at = (width, source = "biome.json") => ({ width, source });

export function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    const text =
      typeof content === "string" ? content : JSON.stringify(content);
    writeFileSync(path, text);
  }
}

// `files` maps a relative path to raw text, or to a value written as JSON so
// a test can also hand over deliberately broken config text.
export function tempTree(t, files) {
  const root = mkdtempSync(join(tmpdir(), "formatter-width-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeTree(root, files);
  return root;
}

// One resolver per tree, as one scan would build it.
export function resolveIn(t, files, paths) {
  const widthFor = createWidthResolver(tempTree(t, files));
  return paths.map((path) => widthFor(path));
}

// Severity boundaries sit one character apart, so the length must be exact.
export function lineOf(length) {
  return `x(${"a".repeat(length - 4)});`;
}

// Goes through scan() rather than scanFile() so the resolver is wired the
// way the CLI wires it.
export function lineViolations(root) {
  const options = {
    paths: ["."],
    root,
    excludes: [],
    testPaths: [],
    rules: ["line-length"],
  };
  return scan(options, buildConfig()).violations;
}

export function lineFindings(root) {
  return lineViolations(root).map((violation) => ({
    file: violation.file,
    length: violation.metric,
    severity: violation.severity,
    message: violation.message,
    widthSource: violation.widthSource,
  }));
}
