import { severityFor } from "./config.mjs";
import { lineAt, matchBracket } from "./offsets.mjs";
import { fieldsFor } from "./rules-file-members.mjs";
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

const NAMING_PATTERNS = {
  cs: [
    /\b(?:public|private|protected|internal|static|readonly|const|volatile|new)\s+[\w<>[\],.? ]+?\s+((?:m_|f_)[A-Za-z_]\w*)\s*(?:[;=,{])/g,
    /^[ \t]*(?:(?:static|readonly|const|volatile|new)\s+)*[\w<>[\],.?]+\s+((?:m_|f_)[A-Za-z_]\w*)\s*(?:[;=])/gm,
    /\b(?:public|private|protected|internal|static|readonly)\s+[\w<>[\],.? ]+?\s+((?:m_|f_)[A-Za-z_]\w*)\s*(?:\{|=>)/g,
  ],
  ts: [
    /^[ \t]*(?:(?:public|private|protected|readonly|static|declare|abstract)\s+)*((?:m_|f_)[A-Za-z_$][\w$]*)\s*!?\??\s*(?::|=|;)/gm,
  ],
  rs: [/^[ \t]*(?:pub(?:\([^)]*\))?\s+)?((?:m_|f_)[A-Za-z_]\w*)\s*:/gm],
};
const PYTHON_MEMBER = /^\s*self\.((?:m_|f_)[A-Za-z_]\w*)\s*=/gm;

function scopeEnd(body, cursor) {
  const opener = body[cursor];
  const close = matchBracket(body, cursor, opener === "{" ? "{}" : "()");
  return close < 0 ? body.length : close + 1;
}

function blankNestedScopes(body) {
  const parts = [body[0] === "{" ? " " : body.slice(0, 1)];
  let cursor = 1;
  while (cursor < body.length) {
    const opener = body[cursor];
    if (opener !== "{" && opener !== "(") {
      parts.push(opener);
      cursor += 1;
      continue;
    }
    const end = scopeEnd(body, cursor);
    parts.push(body.slice(cursor, end).replace(/[^\n]/g, " "));
    cursor = end;
  }
  return parts.join("");
}

function namingMatches({ pattern, source, baseOffset, accept }) {
  const result = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match !== null) {
    if (accept(match[1]))
      result.push({
        name: match[1],
        offset: baseOffset + match.index + match[0].lastIndexOf(match[1]),
      });
    match = pattern.exec(source);
  }
  return result;
}

function namingAcceptance(file, fields) {
  return (name) =>
    fields.has(name) || file.lang === "cs" || file.lang === "ts";
}

function namingPatternMatches({ patterns, source, baseOffset, accept }) {
  return patterns.flatMap((pattern) =>
    namingMatches({ pattern, source, baseOffset, accept }),
  );
}

function namingPropertyMatches({ file, span, patterns, accept }) {
  if (file.lang !== "cs") return [];
  return namingMatches({
    pattern: patterns[2],
    source: span.body,
    baseOffset: span.open,
    accept,
  });
}

function isRustImpl(file, span) {
  return file.lang === "rs" && span.kind === "impl";
}

function namingSpanMatches(file, span) {
  if (isRustImpl(file, span)) return [];
  const patterns = NAMING_PATTERNS[file.lang];
  if (!patterns) return [];
  const fields = span.fields ?? fieldsFor(span.body, file.lang);
  const accept = namingAcceptance(file, fields);
  const masked = blankNestedScopes(span.body);
  const result = namingPatternMatches({
    patterns,
    source: masked,
    baseOffset: span.open,
    accept,
  });
  result.push(...namingPropertyMatches({ file, span, patterns, accept }));
  return result;
}

function encodedMemberMatches(file, code, spans) {
  if (/(^|[\\/])(?:generated|interop)(?:[\\/]|$)|\.generated\./i.test(file.rel))
    return [];
  if (file.lang === "py")
    return namingMatches({
      pattern: PYTHON_MEMBER,
      source: code,
      baseOffset: 0,
      accept: () => true,
    });
  const unique = new Map();
  for (const match of spans.flatMap((span) => namingSpanMatches(file, span)))
    unique.set(`${match.name}:${match.offset}`, match);
  return [...unique.values()];
}

function checkNamingEncodings({ file, config, code, starts, spans, out }) {
  for (const match of encodedMemberMatches(file, code, spans))
    push({
      out,
      file,
      line: lineAt(starts, match.offset),
      rule: "naming-encoding",
      severity: config.presence["naming-encoding"],
      message: `${match.name} uses a type or scope encoding; rename it without the m_/f_ prefix`,
      metric: 1,
    });
}

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

export function checkTypes({ file, config, types, code, starts, spans, out }) {
  checkNamingEncodings({ file, config, code, starts, spans, out });
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
