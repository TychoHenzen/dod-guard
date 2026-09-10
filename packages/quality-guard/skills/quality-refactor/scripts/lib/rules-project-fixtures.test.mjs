import { buildConfig } from "./config.mjs";
import { lineIndex } from "./offsets.mjs";
import { scanFile } from "./rules-file.mjs";

export function fileWithCode(rel, code, { isTest = false, lang = "ts" } = {}) {
  return { rel, lang, isTest, source: code, lines: code.split("\n") };
}

export function rustFile(rel, code) {
  return fileWithCode(rel, code, { lang: "rs" });
}

export function scansFor(files) {
  const scans = new Map();
  for (const file of files)
    scans.set(file.rel, { code: file.source, starts: lineIndex(file.source) });
  return scans;
}

export function rustScansFor(files, config = buildConfig("default")) {
  const scans = new Map();
  for (const file of files) scans.set(file.rel, scanFile(file, config));
  return scans;
}
