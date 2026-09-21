import { push } from "./violations.mjs";

function outputParameter(lang, param) {
  const value = param.trim();
  if (lang === "cs")
    return /^(?:\[[^\]]*\]\s*)*(?:scoped\s+)?(?:ref(?!\s+readonly\b)|out)\b/.test(value);
  if (lang === "rs") {
    if (/^(?:mut\s+)?self\s*:\s*&\s*(?:'[A-Za-z_]\w*\s+)?mut\s+Self\b/.test(value))
      return false;
    return /^\s*(?:mut\s+)?[A-Za-z_]\w*\s*:\s*&\s*(?:'[A-Za-z_]\w*\s+)?mut\b/.test(value);
  }
  return false;
}

function booleanParameter(lang, param) {
  const value = param.trim();
  if (lang === "cs")
    return /^(?:\[[^\]]*\]\s*)*(?:(?:this|scoped|ref|out|in)\s+)*(?:bool|System\.Boolean)\s+\w+\s*$/.test(value);
  if (lang === "ts")
    return !/^this\s*:/.test(value) && /^[A-Za-z_$][\w$]*\s*:\s*boolean\s*$/.test(value);
  if (lang === "rs") return /^(?:mut\s+)?[A-Za-z_]\w*\s*:\s*bool\s*$/.test(value);
  return false;
}

export function checkFunctionSmells({ file, config, fn, out }) {
  for (const param of fn.params) {
    if (outputParameter(file.lang, param))
      push({
        out,
        file,
        line: fn.line,
        rule: "output-parameter",
        severity: config.presence["output-parameter"],
        message: `${fn.name}() exposes an output parameter; return a value instead`,
        metric: 1,
      });
    if (booleanParameter(file.lang, param))
      push({
        out,
        file,
        line: fn.line,
        rule: "flag-parameter",
        severity: config.presence["flag-parameter"],
        message: `${fn.name}() takes a boolean flag; split the behavior or name the policy`,
        metric: 1,
      });
  }
}
