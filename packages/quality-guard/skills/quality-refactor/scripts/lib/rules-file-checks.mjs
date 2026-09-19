import { severityFor } from "./config.mjs";
import { push } from "./violations.mjs";

const STATIC_OR_CONST = /\bconst\b|(?<!')\bstatic\b/;
const MODULE_SCOPED_LANGS = new Set(["ts", "rs"]);
const EXPORT_KEYWORD = /\b(export|pub)\b/;
const IMPLICIT_CALLERS = new Set([
  "main",
  "constructor",
  "default",
  "setup",
  "teardown",
]);

export function checkMetrics({ file, config, fn, metrics, out }) {
  const label = `${fn.name}()`;
  const report = (rule, value, text) => {
    push({
      out,
      file,
      line: fn.line,
      rule,
      severity: severityFor(config, rule, value),
      message: `${label} ${text}`,
      metric: value,
    });
  };
  report(
    "complexity",
    metrics.complexity,
    `cyclomatic complexity ${metrics.complexity}`,
  );
  report("function-length", metrics.length, `is ${metrics.length} lines`);
  report("param-count", metrics.params, `takes ${metrics.params} parameters`);
  report(
    "nesting-depth",
    metrics.nesting,
    `nests ${metrics.nesting} levels deep`,
  );
}

export function checkGuardStyle({ file, config, fn, out }) {
  const elses = (fn.body.match(/\belse\b/g) ?? []).length;
  if (elses === 0) return;
  const message =
    `${fn.name}() has ${elses} else branch(es) ` +
    "\u2014 prefer guard clauses";
  push({
    out,
    file,
    line: fn.line,
    rule: "else-branch",
    severity: config.presence["else-branch"],
    message,
    metric: elses,
  });
}

function isStatic(code, headerStart) {
  return STATIC_OR_CONST.test(
    code.slice(Math.max(0, headerStart - 60), headerStart),
  );
}

export function checkTypes({ file, config, types, out }) {
  if (types.length <= 1) return;
  const names = types.map((type) => type.name).join(", ");
  const severity = severityFor(config, "types-per-file", types.length);
  push({
    out,
    file,
    line: types[1].line,
    rule: "types-per-file",
    severity,
    message: `${types.length} types in one file: ${names}`,
    metric: types.length,
  });
}

function outputParameter(lang, param) {
  const value = param.trim();
  if (lang === "cs")
    return /^(?:\[[^\]]*\]\s*)*(?:scoped\s+)?(?:ref(?!\s+readonly\b)|out)\b/.test(
      value,
    );
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
    return /^(?:\[[^\]]*\]\s*)*(?:(?:this|scoped|ref|out|in)\s+)*(?:bool|System\.Boolean)\s+\w+\s*$/.test(
      value,
    );
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

export { EXPORT_KEYWORD, IMPLICIT_CALLERS, MODULE_SCOPED_LANGS, isStatic };
