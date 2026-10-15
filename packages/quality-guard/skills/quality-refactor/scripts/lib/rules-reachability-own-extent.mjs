// The span of an export's own declaration: its function body, type body or
// declaring statement. Mentions inside it refer to the symbol itself.
import { declaredTypes } from "./architecture-types.mjs";
import { findExpressionEnd } from "./parse-expression-end.mjs";

const BINDING_BEFORE = new RegExp(
  String.raw`\b(?:function\s*\*?|class|interface|type|enum|` +
    String.raw`const|let|var|def|struct|record)\s+$`,
);
const STATEMENT_BEFORE = /\b(?:const|let|var|type)\s+$/;
// Wide enough for the longest keyword plus the whitespace before the name.
const LOOKBEHIND = 24;
const typesByScan = new WeakMap();

function textBefore(code, offset) {
  return code.slice(Math.max(0, offset - LOOKBEHIND), offset);
}

export function isBinding(code, offset) {
  return BINDING_BEFORE.test(textBefore(code, offset));
}

export function inside(range, offset) {
  return range.start <= offset && offset <= range.end;
}

// declaredTypes re-strips the source, so it runs once per file, not per name.
function typesOf(file, scan) {
  let types = typesByScan.get(scan);
  if (types === undefined) {
    types = declaredTypes(file.source ?? scan.code, file.lang).types;
    typesByScan.set(scan, types);
  }
  return types;
}

function containing(extents, at) {
  return extents.find((extent) => inside(extent.header, at)) ?? null;
}

// Matched by containment, not name alone: a C# constructor is a function
// with the class's name, and its body is not the class's own extent.
function functionExtent(scan, name, at) {
  const extents = (scan.functions ?? [])
    .filter((fn) => fn.name === name)
    .map((fn) => ({
      start: fn.headerStart,
      end: fn.end,
      header: { start: fn.headerStart, end: fn.end },
    }));
  return containing(extents, at);
}

function typeExtent(types, name, at) {
  const extents = types
    .filter((type) => type.name === name)
    .map((type) => ({
      start: type.start,
      end: type.body.end,
      header: { start: type.start, end: type.body.start - 1 },
    }));
  return containing(extents, at);
}

// ASSUMPTION: findExpressionEnd stops at a top-level comma, so a comma in
// a type annotation (Record<string, X>) ends the extent early. Accepted:
// only a self-reference in that initializer would then count as a use.
function statementExtent(code, at) {
  if (!STATEMENT_BEFORE.test(textBefore(code, at))) return null;
  return { start: at, end: findExpressionEnd(code, at) };
}

/** The extent declared at offset `at`, or null when none can be found. */
export function ownExtent({ file, scan, name, at }) {
  return (
    functionExtent(scan, name, at) ??
    typeExtent(typesOf(file, scan), name, at) ??
    statementExtent(scan.code, at)
  );
}
