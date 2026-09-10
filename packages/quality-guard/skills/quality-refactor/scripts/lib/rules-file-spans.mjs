import { matchBracket } from "./offsets.mjs";
import { findRustImpls } from "./parse-types.mjs";
import { fieldsFor } from "./rules-file-members.mjs";

function bracedSpan(code, offset) {
  const open = code.indexOf("{", offset);
  if (open === -1) return null;
  const close = matchBracket(code, open, "{}");
  if (close === -1) return null;
  return { open, close, body: code.slice(open, close) };
}

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

function implSpans(code, fieldsByType) {
  const spans = [];
  for (const impl of findRustImpls(code)) {
    const span = bracedSpan(code, impl.offset);
    if (span === null) continue;
    spans.push({
      name: impl.typeName,
      open: span.open,
      close: span.close,
      fields: fieldsByType.get(impl.typeName) ?? null,
    });
  }
  return spans;
}

export function classSpans(code, types, lang) {
  const { spans, fieldsByType } = typeSpans(code, types, lang);
  return lang === "rs" ? [...spans, ...implSpans(code, fieldsByType)] : spans;
}
