// Functions whose own parameter declares an export's name. Inside one the
// name means the parameter, not the export, so an occurrence there (the
// parameter itself included) is not a use of the export.
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;
const DESTRUCTURED = /^[{[(]/;
const shadowsByScan = new WeakMap();

// ASSUMPTION: the binding is the last identifier of the text before any
// default and type annotation (`int x`, `mut x: u32`, `...rest`), except
// in Go, which writes the name first (`b int`). A destructured parameter
// is not read, so a name bound only that way still counts as a use.
function boundName(param, lang) {
  if (DESTRUCTURED.test(param)) return null;
  const declared = param.split("=", 1)[0].replaceAll("::", "");
  const names = declared.split(":", 1)[0].match(IDENTIFIER) ?? [];
  if (lang === "go") return names[0] ?? null;
  return names.at(-1) ?? null;
}

function shadowTable(scan, lang) {
  let table = shadowsByScan.get(scan);
  if (table === undefined) {
    table = (scan.functions ?? []).map((fn) => ({
      names: new Set(fn.params.map((param) => boundName(param, lang))),
      range: { start: fn.headerStart, end: fn.end },
    }));
    shadowsByScan.set(scan, table);
  }
  return table;
}

/** The ranges of the functions in `scan` that have a parameter `name`. */
export function shadowingRanges(scan, lang, name) {
  return shadowTable(scan, lang)
    .filter((entry) => entry.names.has(name))
    .map((entry) => entry.range);
}
