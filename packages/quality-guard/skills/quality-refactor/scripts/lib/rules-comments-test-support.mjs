import { buildConfig } from "./config.mjs";
import { scanFile } from "./rules-file.mjs";

export function scan(lang, code, rule) {
  const file = {
    rel: "src/lib." + lang,
    lang,
    isTest: false,
    source: code,
    lines: code.split("\n"),
  };
  return scanFile(file, buildConfig("default")).violations.filter(
    (violation) => violation.rule === rule,
  );
}
