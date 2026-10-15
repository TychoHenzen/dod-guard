import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { lineIndex } from "../../../../../skills/quality-refactor/scripts/lib/offsets.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { checkReachability } from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";

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

export function rustScansFor(files, config = buildConfig()) {
  const scans = new Map();
  for (const file of files) scans.set(file.rel, scanFile(file, config));
  return scans;
}

export function testFile(rel, code, lang = "ts") {
  return fileWithCode(rel, code, { isTest: true, lang });
}

// Full scans, because the same-module rule reads each file's function list
// and interpolation captures, which scansFor leaves out. rustScansFor is a
// plain scanFile pass, so it serves every language.
export function reachabilityRulesFor(name, files) {
  const config = buildConfig();
  const scans = rustScansFor(files, config);
  return checkReachability({ files, scans, config })
    .filter((violation) => violation.message.startsWith(`${name} `))
    .map((violation) => violation.rule);
}
