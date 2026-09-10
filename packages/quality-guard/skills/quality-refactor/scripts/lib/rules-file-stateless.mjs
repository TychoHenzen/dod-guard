import { lineAt } from "./offsets.mjs";
import { isStatic } from "./rules-file-checks.mjs";
import { push } from "./violations.mjs";

export function enclosingClass(spans, fn) {
  return (
    spans.find((span) => fn.headerStart > span.open && fn.end < span.close) ??
    null
  );
}

function interpolationsInFn(fn, context) {
  const end = lineAt(context.starts, fn.end);
  return context.interpolations.filter(
    (id) => id.line >= fn.line && id.line <= end,
  );
}

function touchesState(fn, fields, interpolations) {
  if (/\b(this|self)\b/.test(fn.body)) return true;
  for (const field of fields) {
    if (new RegExp(`\\b${field}\\b`).test(fn.body)) return true;
  }
  return interpolations.some((id) => fields.has(id.name));
}

function statelessCandidate(owner, fn) {
  return owner !== null && fn.name !== "constructor" && fn.name !== owner.name;
}

export function checkStatelessMethod({ file, config, fn, context, out }) {
  const owner = enclosingClass(context.spans, fn);
  if (!statelessCandidate(owner, fn) || owner.fields === null) return;
  const interpolations = interpolationsInFn(fn, context);
  if (
    touchesState(fn, owner.fields, interpolations) ||
    isStatic(context.code, fn.headerStart)
  )
    return;
  const severity = config.presence["stateless-method"];
  push({
    out,
    file,
    line: fn.line,
    rule: "stateless-method",
    severity,
    message:
      `${fn.name}() never touches instance state ` +
      "\u2014 make it a free function",
    metric: 1,
  });
}
