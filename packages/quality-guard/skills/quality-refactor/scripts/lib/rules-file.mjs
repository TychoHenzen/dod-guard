// Per-file rules: size, shape, and complexity of a single source file.

import { severityFor } from "./config.mjs";
import { lineAt, lineIndex, matchBracket } from "./offsets.mjs";
import { findRustImpls, findTypes } from "./parse-types.mjs";
import { findFunctions } from "./parse.mjs";
import { checkComments } from "./rules-comments.mjs";
import { strip } from "./strip.mjs";
import { push } from "./violations.mjs";

/**
 * Rust closures open with a pipe-delimited parameter list. So a
 * zero-argument closure, `|| body`, is written with the same two characters
 * as boolean-or. What sits right before the pipes tells them apart. Boolean-or
 * sits between two values, so it always follows the end of one: an
 * identifier, a `)`, or a `]`. A closure's `||` opens a new expression
 * instead. It follows a delimiter such as `(`, `,`, `=`, `{`, `[`, `;` or
 * `:`, or a keyword that starts one such as `move` or `return`. None of
 * those end a value.
 *
 * This reads only what comes before the pipes, never what follows. So a
 * closure returned bare as a block's last expression, `{ || foo() }`, is
 * excluded too, because `{` does not end a value either. That undercounts
 * rather than overcounts. Given the choice, this stays quiet rather than
 * noisy. See the file header.
 */
const RUST_BOOLEAN_OR = /(?<!\b(?:move|return)\s{0,3})(?<=[\w)\]])\s{0,3}\|\|/g;

/** Decision points that add a branch, per language family. */
const DECISION_PATTERNS = {
  common: [/\bif\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /\bcatch\b/g, /&&/g],
  ts: [/\?\?/g, /\?(?![.?:])/g, /\|\|/g],
  cs: [/\?\?/g, /\?(?![.?:])/g, /\bwhen\b/g, /\|\|/g],
  /**
   * `=>` counts one match arm. The pattern reads a fat arrow at the top
   * level of a match body as one branch. It does not also charge for the
   * `match` keyword, so a four-arm match scores four, not five.
   *
   * That is an approximation rather than an exact arm count. A closure or a
   * nested match inside an arm contributes its own `=>` tokens the same way.
   * So a match with a closure in one arm reads as more branches than it
   * visually has. Counting only top-level arrows would need a real parse of
   * the match body. This file trades that precision for staying simple, on
   * the same "stay quiet, not exhaustive" bias as the rest of the scanner.
   *
   * `RUST_BOOLEAN_OR` replaces `||` here rather than joining it. That
   * pattern's own comment says why the plain token is ambiguous in Rust.
   *
   * `if let` and `while let` need no pattern of their own. Both open with
   * the `if` or `while` keyword the common set already matches, so both are
   * charged once, correctly, before any Rust pattern runs.
   *
   * The `?` early-return operator is deliberately not counted. It is a
   * branch by the usual definition. It is also the standard way to pass an
   * error up in Rust. A function with five fallible calls in a row would
   * read as complexity 6 for doing nothing unusual. Counting it would make
   * every honest function look complex, which is the false-positive noise
   * this scanner is tuned to avoid. See the file header.
   */
  rs: [/=>/g, RUST_BOOLEAN_OR],
  py: [/\belif\b/g, /\band\b/g, /\bor\b/g],
  go: [/\bselect\b/g, /\|\|/g],
  java: [/\?(?![.?:])/g, /\|\|/g],
  cpp: [/\?(?![.?:])/g, /\|\|/g],
};

/**
 * A tuple type element, optionally carrying a field name.
 * Excluding parens, quotes, and braces is what keeps array *values* like
 * `leaves: [makeLeaf(a), makeLeaf(b)]` out of the results.
 */
const TYPE_ELEMENT = "(?:[A-Za-z_$][\\w$]*\\??\\s*:\\s*)?[A-Za-z_$][\\w$.<>|& \\[\\]]*";
const TUPLE_LITERAL = `\\[\\s*${TYPE_ELEMENT}\\s*(?:,\\s*${TYPE_ELEMENT}\\s*)+\\]`;
/** Only positions that are unambiguously type annotations, never values. */
const TS_TYPE_POSITION = `(?:\\)\\s*:|\\b(?:const|let|var|readonly)\\s+[\\w$]+\\s*:|\\btype\\s+[\\w$]+\\s*=)`;

/** Tuple types are forbidden, including variants whose elements have names. */
const TUPLE_PATTERNS = {
  ts: new RegExp(`${TS_TYPE_POSITION}\\s*(?:readonly\\s+)?${TUPLE_LITERAL}`, "g"),
  cs: /\((?:[\w.<>[\]?]+(?:\s+\w+)?\s*,\s*)+[\w.<>[\]?]+(?:\s+\w+)?\)\s+\w+\s*\(/g,
  rs: /->\s*\([^)\n]*,[^)\n]*\)/g,
  py: /:\s*[Tt]uple\[[^\]\n]*,/g,
};

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
 * alone - the field names themselves have to be known.
 *
 * This shape only matches a field carrying its own modifier right before the
 * type - `private int balance;`, `public string Name;` - the ordinary Java
 * shape, and the C# shape for a field that is not a property. A C# property
 * and a C++ field grouped under an access-specifier section need their own
 * shapes; see CS_PROPERTY_DECL and CPP_FIELD_DECL below.
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

/**
 * A C# auto-property (`Foo { get; set; }`) or expression-bodied property
 * (`Foo => expr;`) is read and written the same way a field is, but
 * FIELD_DECL never matches either shape: an auto-property ends in `}`, not
 * the `;`/`=` FIELD_DECL requires right after the name, and an
 * expression-bodied property puts its value after a `=>`, not behind a bare
 * terminator. This is the property-only equivalent, anchored on those two
 * closers instead. A method never matches either alternative: its name is
 * always followed directly by `(`, which is neither a `{ get`/`{ init` nor a
 * `=>`, so a return type is never mistaken for a property type.
 */
const CS_PROPERTY_DECL = new RegExp(
  `\\b(?:${FIELD_MODIFIER})\\s+[\\w<>[\\],.? ]+?\\s+(\\w+)\\s*(?:\\{\\s*(?:private\\s+|protected\\s+|internal\\s+)?(?:get|init)\\b|=>)`,
  "g",
);

function csPropertyNames(body) {
  const names = new Set();
  CS_PROPERTY_DECL.lastIndex = 0;
  let match = CS_PROPERTY_DECL.exec(body);
  while (match !== null) {
    names.add(match[1]);
    match = CS_PROPERTY_DECL.exec(body);
  }
  return names;
}

/**
 * Idiomatic C++ rarely gives a field its own modifier. It groups fields
 * under a `private:`, `protected:` or `public:` access-specifier section.
 * A type lacking a section defaults to private, an aggregate to public. None of
 * that changes which names count as fields here, because state access does
 * not care which section declared a name. So no specifier keyword is
 * matched at all. A specifier is just a line the pattern below skips,
 * harmless whichever section it opens.
 *
 * What the pattern does need is depth. A C++ type body mixes field
 * declarations with inline method bodies in one textual scope, unlike a
 * Rust aggregate body. A local variable inside one of those bodies has the
 * same `TYPE NAME;` shape as a field. So blankNested blanks every span
 * nested one brace deeper than the type body before the field pattern
 * runs. That covers a method body, a constructor initializer list, and a
 * lambda, and it keeps a local from reading as a field.
 *
 * A pointer or reference member with no space before its name, `int* p;`,
 * is not matched. That is an accepted gap, not a silent one. See the file
 * header on staying quiet over exhaustive.
 */
function blankNested(body) {
  const parts = [body.slice(0, 1)];
  let i = 1;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "{") {
      const close = matchBracket(body, i, "{}");
      const end = close === -1 ? body.length : close + 1;
      parts.push(body.slice(i, end).replace(/[^\n]/g, " "));
      i = end;
      continue;
    }
    parts.push(ch);
    i += 1;
  }
  return parts.join("");
}

const CPP_FIELD_DECL = /^[ \t]*(?:(?:static|const|mutable|volatile)[ \t]+)*[\w:<>[\],.&*~]+?[ \t]+[*&]?(\w+)[ \t]*[;=]/gm;

function cppFieldNames(body) {
  const flattened = blankNested(body);
  const names = new Set();
  CPP_FIELD_DECL.lastIndex = 0;
  let match = CPP_FIELD_DECL.exec(flattened);
  while (match !== null) {
    names.add(match[1]);
    match = CPP_FIELD_DECL.exec(flattened);
  }
  return names;
}

/** A per-language collector for field names FIELD_DECL's modifier shape misses. */
const EXTRA_FIELD_NAMES = { cs: csPropertyNames, cpp: cppFieldNames };

/** Every field-shaped name in a type's body, matched per that language's own field shapes. */
function fieldsFor(body, lang) {
  if (lang === "rs") return rustFieldNames(body);
  const names = fieldNames(body);
  const extra = EXTRA_FIELD_NAMES[lang];
  if (extra) for (const name of extra(body)) names.add(name);
  return names;
}

/**
 * Rust struct fields carry no modifier keyword - `bar: i32,` not
 * `private bar: i32;` - so FIELD_DECL above never matches one. This is the
 * Rust-only equivalent, keyed on the `name:` shape instead.
 */
const RUST_FIELD_DECL = /^[ \t]*(?:pub(?:\([\w:, ]*\))?\s+)?([A-Za-z_]\w*)\s*:/gm;

function rustFieldNames(body) {
  const names = new Set();
  RUST_FIELD_DECL.lastIndex = 0;
  let match = RUST_FIELD_DECL.exec(body);
  while (match !== null) {
    names.add(match[1]);
    match = RUST_FIELD_DECL.exec(body);
  }
  return names;
}

/** The brace-matched body starting at the first `{` at or after `offset`. */
function bracedSpan(code, offset) {
  const open = code.indexOf("{", offset);
  if (open === -1) return null;
  const close = matchBracket(code, open, "{}");
  if (close === -1) return null;
  return { open, close, body: code.slice(open, close) };
}

/** Type spans plus the field set each one carries, by name. */
function typeSpans(code, types, lang) {
  const spans = [];
  const fieldsByType = new Map();
  for (const type of types) {
    const span = bracedSpan(code, type.offset);
    if (span === null) continue;
    const fields = fieldsFor(span.body, lang);
    fieldsByType.set(type.name, fields);
    spans.push({ name: type.name, open: span.open, close: span.close, fields });
  }
  return { spans, fieldsByType };
}

/**
 * Rust impl-block spans. An aggregate's own span cannot tell a Rust method from
 * a free function. Rust keeps fields in the aggregate body and methods in a
 * separate `impl` block. Each span borrows its field set from
 * `fieldsByType`, keyed by the implementing type's name. When this file
 * holds no aggregate of that name, fields stays null. Then
 * `checkStatelessMethod` treats the method's state access as unproven,
 * rather than guessing "stateless".
 */
function implSpans(code, fieldsByType) {
  const spans = [];
  for (const impl of findRustImpls(code)) {
    const span = bracedSpan(code, impl.offset);
    if (span === null) continue;
    const fields = fieldsByType.get(impl.typeName) ?? null;
    spans.push({ name: impl.typeName, open: span.open, close: span.close, fields });
  }
  return spans;
}

/**
 * Class body spans, so a method can be told apart from a free function.
 * `findRustImpls` in parse-types.mjs stays out of `findTypes` on purpose.
 * An impl block is not a type declaration. Folding it in would count
 * A named aggregate plus `impl Foo` as two types instead of one.
 */
function classSpans(code, types, lang) {
  const { spans, fieldsByType } = typeSpans(code, types, lang);
  if (lang !== "rs") return spans;
  return [...spans, ...implSpans(code, fieldsByType)];
}

/**
 * A plain `\bstatic\b` word-boundary match also fires inside a Rust
 * lifetime. `&'static` puts a non-word `'` right before `static`, so the
 * boundary alone cannot tell the reserved lifetime from the keyword. A
 * negative lookbehind for that leading `'` fixes it. `const` has no such
 * collision, because Rust has no `'const` form. It stays a plain match.
 */
const STATIC_OR_CONST = /\bconst\b|(?<!')\bstatic\b/;

function isStatic(code, headerStart) {
  return STATIC_OR_CONST.test(code.slice(Math.max(0, headerStart - 60), headerStart));
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

/** Free functions nothing in their own file calls - dead by construction. */
function checkUnusedLocal(file, config, fn, context, out) {
  if (!MODULE_SCOPED_LANGS.has(file.lang) || file.isTest) return;
  if (IMPLICIT_CALLERS.has(fn.name) || isExported(context.code, fn.headerStart)) return;
  if (enclosingClass(context.spans, fn) !== null) return;
  const references = context.code.match(new RegExp(`\\b${fn.name}\\b`, "g")) ?? [];
  // A name read only inside a Rust format capture never appears in `code`,
  // because strip blanks the whole string it sits in. So a capture of this
  // name counts as a reference, the same as a plain-code match.
  const captureRefs = context.interpolations.filter((id) => id.name === fn.name).length;
  if (references.length + captureRefs > 1) return;
  const severity = config.presence["unused-local"];
  const message = `${fn.name}() is never called in this file and is not exported`;
  push(out, file, fn.line, "unused-local", severity, message, 1);
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

/**
 * Interpolation identifiers whose line falls inside `fn`'s own span, from
 * its header through its closing brace. A capture read from another
 * function's string then never counts as this one touching state.
 */
function interpolationsInFn(fn, context) {
  const end = lineAt(context.starts, fn.end);
  return context.interpolations.filter((id) => id.line >= fn.line && id.line <= end);
}

function touchesState(fn, fields, interpolations) {
  if (/\b(this|self)\b/.test(fn.body)) return true;
  for (const field of fields) {
    if (new RegExp(`\\b${field}\\b`).test(fn.body)) return true;
  }
  // A field read only through `$"...{_name}..."` or `"{_name}"` never
  // appears in `fn.body`, because strip blanks the whole string it sits in.
  // So a capture naming the field counts the same as a body match would.
  return interpolations.some((id) => fields.has(id.name));
}

function checkStatelessMethod(file, config, fn, context, out) {
  const owner = enclosingClass(context.spans, fn);
  if (owner === null || fn.name === "constructor" || fn.name === owner.name) return;
  // owner.fields is null only for a Rust impl block whose aggregate lives
  // outside this file. State access cannot be proven either way there, so
  // stay quiet rather than report a false "stateless".
  if (owner.fields === null) return;
  const interpolations = interpolationsInFn(fn, context);
  if (touchesState(fn, owner.fields, interpolations) || isStatic(context.code, fn.headerStart)) return;
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
  checkStatelessMethod(file, config, fn, context, out);
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
    const message = `tuple ${match[0].trim()} — replace it with a named type`;
    push(out, file, line, "unnamed-tuple", severity, message, 1);
    match = pattern.exec(code);
  }
}

/**
 * Rust puts a unit-test module in the same file as the code it tests,
 * gated by `#[cfg(test)]`. Every other rule here reads `isTest` as a
 * property of a whole file, set once from its path in walk.mjs. But a
 * `.rs` file is routinely part production and part test. One boolean
 * cannot say "production, except for this one module inside it."
 *
 * Widening `isTest` to three states would not fix it either. One file can
 * hold a production caller and a `#[cfg(test)]` caller of one symbol. Those
 * two have to stay apart at the same time. So test-ness
 * lives here as a list of offset spans, carried beside the other per-file
 * scan data. Every rule that cares asks whether its position falls in one.
 *
 * Only `#[cfg(test)]` and `#[cfg(all(test, ...))]` count as test gates.
 * `#[cfg(any(test, ...))]`, `#[cfg(not(test))]` and `#[cfg_attr(test, ...)]`
 * are left alone. Getting the boolean logic right for an arbitrary `cfg`
 * expression is not worth it here. Reading an unknown gate as production
 * code is today's behaviour, and it is the safe way to fail.
 */
const CFG_TEST_PLAIN = /#\[cfg\(test\)\]/g;
const CFG_TEST_ALL = /#\[cfg\(all\(([^()]*)\)\)\]/g;

/** The offset just past the `]` of every `#[cfg(test)]`-shaped attribute. */
function cfgTestAttributeEnds(code) {
  const ends = [];
  CFG_TEST_PLAIN.lastIndex = 0;
  let match = CFG_TEST_PLAIN.exec(code);
  while (match !== null) {
    ends.push(match.index + match[0].length);
    match = CFG_TEST_PLAIN.exec(code);
  }
  CFG_TEST_ALL.lastIndex = 0;
  match = CFG_TEST_ALL.exec(code);
  while (match !== null) {
    if (/\btest\b/.test(match[1])) ends.push(match.index + match[0].length);
    match = CFG_TEST_ALL.exec(code);
  }
  return ends;
}

/**
 * The end offset of the item that starts right after `from`. For a
 * brace-bodied item such as `mod`, `fn`, a braced aggregate or `impl`, that
 * is the matching `}`. For a semicolon-terminated one such as `const`,
 * `static`, `use` or a unit aggregate, it is the `;`. A stray attribute
 * between the cfg gate and the item, a stacked `#[allow(...)]` say, holds
 * neither character. The scan passes straight through it to the real item.
 */
function itemSpanEnd(code, from) {
  for (let i = from; i < code.length; i += 1) {
    if (code[i] === "{") return matchBracket(code, i, "{}");
    if (code[i] === ";") return i;
  }
  return -1;
}

/** Every `#[cfg(test)]`-gated span in this Rust file, as `{ start, end }` offsets. */
function findRustTestRegions(code) {
  const regions = [];
  for (const attrEnd of cfgTestAttributeEnds(code)) {
    const end = itemSpanEnd(code, attrEnd);
    if (end !== -1) regions.push({ start: attrEnd, end });
  }
  return regions.sort((a, b) => a.start - b.start);
}

/** Whether `offset` falls inside any of `regions`. Exported for rules-project.mjs. */
export function inTestRegion(regions, offset) {
  return regions.some((region) => offset >= region.start && offset <= region.end);
}

/** Run every per-file rule. Returns violations plus data the project rules reuse. */
export function scanFile(file, config) {
  const { code, comments, interpolations } = strip(file.source, file.lang);
  const starts = lineIndex(code);
  const functions = findFunctions(code, file.lang, starts);
  const types = findTypes(code, file.lang, starts);
  const spans = file.lang === "py" ? [] : classSpans(code, types, file.lang);
  const testRegions = file.lang === "rs" ? findRustTestRegions(code) : [];
  const out = [];

  checkLines(file, config, out);
  checkTypes(file, config, types, out);
  checkTuples(file, config, code, starts, out);
  checkComments(file, config, comments, code.split("\n"), out);
  const context = { starts, spans, code, interpolations };
  for (const fn of functions) {
    if (inTestRegion(testRegions, fn.headerStart)) continue;
    checkFunction(file, config, fn, context, out);
  }

  return { violations: out, code, starts, functions, types, testRegions, interpolations };
}
