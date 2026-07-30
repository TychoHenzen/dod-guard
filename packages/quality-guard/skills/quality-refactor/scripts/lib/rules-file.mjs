// Per-file rules: size, shape, and complexity of a single source file.

import { severityFor } from "./config.mjs";
import { lineAt, lineIndex, matchBracket } from "./offsets.mjs";
import { findTypes } from "./parse-types.mjs";
import { findFunctions } from "./parse.mjs";
import { strip } from "./strip.mjs";

/** Decision points that add a branch, per language family. */
const DECISION_PATTERNS = {
  common: [/\bif\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /\bcatch\b/g, /&&/g, /\|\|/g],
  ts: [/\?\?/g, /\?(?![.?:])/g],
  cs: [/\?\?/g, /\?(?![.?:])/g, /\bwhen\b/g],
  rs: [/=>/g, /\bmatch\b/g],
  py: [/\belif\b/g, /\band\b/g, /\bor\b/g],
  go: [/\bselect\b/g],
  java: [/\?(?![.?:])/g],
  cpp: [/\?(?![.?:])/g],
};

/**
 * A tuple type element: an identifier and its type decorations, nothing else.
 * Excluding parens, quotes, and braces is what keeps array *values* like
 * `leaves: [makeLeaf(a), makeLeaf(b)]` out of the results.
 */
const TYPE_ELEMENT = "[A-Za-z_$][\\w$.<>|& \\[\\]]*";
const TUPLE_LITERAL = `\\[\\s*${TYPE_ELEMENT}\\s*(?:,\\s*${TYPE_ELEMENT}\\s*)+\\]`;
/** Only positions that are unambiguously type annotations, never values. */
const TS_TYPE_POSITION = `(?:\\)\\s*:|\\b(?:const|let|var|readonly)\\s+[\\w$]+\\s*:|\\btype\\s+[\\w$]+\\s*=)`;

/** Tuple types with no field names — the reader has to guess what .0 means. */
const TUPLE_PATTERNS = {
  ts: new RegExp(`${TS_TYPE_POSITION}\\s*(?:readonly\\s+)?${TUPLE_LITERAL}`, "g"),
  cs: /\((?:[\w.<>[\]?]+\s*,\s*)+[\w.<>[\]?]+\)\s+\w+\s*\(/g,
  rs: /->\s*\([^)\n]*,[^)\n]*\)/g,
  py: /:\s*[Tt]uple\[[^\]\n]*,/g,
};

const TODO_MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;
const CODE_IN_COMMENT = /^[^\w]*(if|for|while|return|const|let|var|function|def|public|private|import|await)\b/;
/**
 * Commented-out code has to both start like a statement and end like one.
 * Prose that quotes a keyword ("`const name = (` is the arrow form") ends in
 * punctuation, not a terminator, so it stays out of the results.
 */
const CODE_TAIL = /[;{}[\]),]\s*$/;
/** Doc comments describe code; they are never commented-out code. */
const DOC_COMMENT = /^(\/\*\*|\/\/\/|"""|''')/;

function countMatches(text, patterns) {
  let total = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const found = text.match(pattern);
    if (found) total += found.length;
  }
  return total;
}

function complexityOf(body, lang) {
  const patterns = [...DECISION_PATTERNS.common, ...(DECISION_PATTERNS[lang] ?? [])];
  return 1 + countMatches(body, patterns);
}

function maxNesting(fn) {
  if (fn.indentBased) {
    let max = 0;
    for (const line of fn.body.split("\n").slice(1)) {
      if (line.trim() === "") continue;
      const indent = /^[ \t]*/.exec(line)[0].replace(/\t/g, "    ").length;
      max = Math.max(max, Math.floor((indent - fn.baseIndent) / 4));
    }
    return max;
  }
  let depth = 0;
  let max = 0;
  for (const ch of fn.body) {
    if (ch === "{") {
      depth += 1;
      max = Math.max(max, depth);
    } else if (ch === "}") depth -= 1;
  }
  return Math.max(0, max - 1);
}

function functionLines(fn, starts) {
  return lineAt(starts, fn.end) - fn.line + 1;
}

/**
 * Field declarations. C#, Java, and C++ reach fields without a receiver, so
 * "does this method touch state" cannot be answered by looking for `this`
 * alone — the field names themselves have to be known.
 */
const FIELD_MODIFIER = "private|protected|internal|public|readonly|static|const|final";
const FIELD_DECL = new RegExp(`\\b(?:${FIELD_MODIFIER})\\s+[\\w<>[\\],.? ]+?\\s+(\\w+)\\s*[;=]`, "g");

function fieldNames(body) {
  const names = new Set();
  FIELD_DECL.lastIndex = 0;
  let match = FIELD_DECL.exec(body);
  while (match !== null) {
    names.add(match[1]);
    match = FIELD_DECL.exec(body);
  }
  return names;
}

/** Class body spans, so a method can be told apart from a free function. */
function classSpans(code, types) {
  const spans = [];
  for (const type of types) {
    const open = code.indexOf("{", type.offset);
    if (open === -1) continue;
    const close = matchBracket(code, open, "{}");
    if (close === -1) continue;
    spans.push({ name: type.name, open, close, fields: fieldNames(code.slice(open, close)) });
  }
  return spans;
}

function isStatic(code, headerStart) {
  return /\b(static|const)\b/.test(code.slice(Math.max(0, headerStart - 60), headerStart));
}

/**
 * Languages where a file is a module, so a symbol without an export keyword
 * cannot possibly be referenced from another file. Only there can a local
 * reference count prove a helper is dead.
 */
const MODULE_SCOPED_LANGS = new Set(["ts", "rs"]);
const EXPORT_KEYWORD = /\b(export|pub)\b/;
/** Names invoked by a runtime or framework rather than by in-repo callers. */
const IMPLICIT_CALLERS = new Set(["main", "constructor", "default", "setup", "teardown"]);

function isExported(code, headerStart) {
  return EXPORT_KEYWORD.test(code.slice(Math.max(0, headerStart - 40), headerStart));
}

/** Free functions nothing in their own file calls — dead by construction. */
function checkUnusedLocal(file, config, fn, context, out) {
  if (!MODULE_SCOPED_LANGS.has(file.lang) || file.isTest) return;
  if (IMPLICIT_CALLERS.has(fn.name) || isExported(context.code, fn.headerStart)) return;
  if (enclosingClass(context.spans, fn) !== null) return;
  const references = context.code.match(new RegExp(`\\b${fn.name}\\b`, "g")) ?? [];
  if (references.length > 1) return;
  const severity = config.presence["unused-local"];
  const message = `${fn.name}() is never called in this file and is not exported`;
  push(out, file, fn.line, "unused-local", severity, message, 1);
}

function push(out, file, line, rule, severity, message, metric) {
  if (severity === null) return;
  out.push({ file: file.rel, line, rule, severity, message, metric });
}

function checkLines(file, config, out) {
  file.lines.forEach((text, index) => {
    const severity = severityFor(config, "line-length", text.length);
    push(out, file, index + 1, "line-length", severity, `line is ${text.length} chars`, text.length);
  });
  const total = file.lines.length;
  const severity = severityFor(config, "file-length", total);
  push(out, file, 1, "file-length", severity, `file is ${total} lines`, total);
}

function checkMetrics(file, config, fn, metrics, out) {
  const label = `${fn.name}()`;
  const at = fn.line;
  const report = (rule, value, text) => {
    push(out, file, at, rule, severityFor(config, rule, value), `${label} ${text}`, value);
  };
  report("complexity", metrics.complexity, `cyclomatic complexity ${metrics.complexity}`);
  report("function-length", metrics.length, `is ${metrics.length} lines`);
  report("param-count", metrics.params, `takes ${metrics.params} parameters`);
  report("nesting-depth", metrics.nesting, `nests ${metrics.nesting} levels deep`);
}

function checkGuardStyle(file, config, fn, out) {
  const elses = countMatches(fn.body, [/\belse\b/g]);
  if (elses === 0) return;
  const severity = config.presence["else-branch"];
  const message = `${fn.name}() has ${elses} else branch(es) — prefer guard clauses`;
  push(out, file, fn.line, "else-branch", severity, message, elses);
}

function enclosingClass(spans, fn) {
  return spans.find((span) => fn.headerStart > span.open && fn.end < span.close) ?? null;
}

function touchesState(fn, fields) {
  if (/\b(this|self)\b/.test(fn.body)) return true;
  for (const field of fields) {
    if (new RegExp(`\\b${field}\\b`).test(fn.body)) return true;
  }
  return false;
}

function checkStatelessMethod(file, config, fn, spans, code, out) {
  const owner = enclosingClass(spans, fn);
  if (owner === null || fn.name === "constructor" || fn.name === owner.name) return;
  if (touchesState(fn, owner.fields) || isStatic(code, fn.headerStart)) return;
  const severity = config.presence["stateless-method"];
  const message = `${fn.name}() never touches instance state — make it a free function`;
  push(out, file, fn.line, "stateless-method", severity, message, 1);
}

function checkFunction(file, config, fn, context, out) {
  const metrics = {
    complexity: complexityOf(fn.body, file.lang),
    length: functionLines(fn, context.starts),
    nesting: maxNesting(fn),
    params: fn.params.length,
  };
  checkMetrics(file, config, fn, metrics, out);
  checkGuardStyle(file, config, fn, out);
  checkStatelessMethod(file, config, fn, context.spans, context.code, out);
  checkUnusedLocal(file, config, fn, context, out);
}

function checkTypes(file, config, types, out) {
  if (types.length <= 1) return;
  const names = types.map((type) => type.name).join(", ");
  const severity = severityFor(config, "types-per-file", types.length);
  const message = `${types.length} types in one file: ${names}`;
  push(out, file, types[1].line, "types-per-file", severity, message, types.length);
}

function checkTuples(file, config, code, starts, out) {
  const pattern = TUPLE_PATTERNS[file.lang];
  if (!pattern) return;
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match !== null) {
    const line = lineAt(starts, match.index);
    const severity = config.presence["unnamed-tuple"];
    const message = `unnamed tuple ${match[0].trim()} — name the fields`;
    push(out, file, line, "unnamed-tuple", severity, message, 1);
    match = pattern.exec(code);
  }
}

function checkComments(file, config, comments, out) {
  for (const comment of comments) {
    const body = comment.text.replace(/^[\s/*#]+|[\s*/]+$/g, "");
    const line = comment.line;
    if (TODO_MARKER.test(body)) {
      const marker = config.presence["todo-marker"];
      push(out, file, line, "todo-marker", marker, `unresolved marker: ${body.slice(0, 60)}`, 1);
      continue;
    }
    if (DOC_COMMENT.test(comment.text.trim())) continue;
    if (!CODE_IN_COMMENT.test(body) || !CODE_TAIL.test(body)) continue;
    const severity = config.presence["commented-out-code"];
    push(out, file, line, "commented-out-code", severity, `commented-out code: ${body.slice(0, 60)}`, 1);
  }
}

/** Run every per-file rule. Returns violations plus data the project rules reuse. */
export function scanFile(file, config) {
  const { code, comments } = strip(file.source, file.lang);
  const starts = lineIndex(code);
  const functions = findFunctions(code, file.lang, starts);
  const types = findTypes(code, file.lang, starts);
  const spans = file.lang === "py" ? [] : classSpans(code, types);
  const out = [];

  checkLines(file, config, out);
  checkTypes(file, config, types, out);
  checkTuples(file, config, code, starts, out);
  checkComments(file, config, comments, out);
  const context = { starts, spans, code };
  for (const fn of functions) checkFunction(file, config, fn, context, out);

  return { violations: out, code, starts, functions, types };
}
