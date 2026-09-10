import { severityFor } from "./config.mjs";
import {
  complexityOf,
  functionLines,
  maxNesting,
} from "./rules-file-metrics.mjs";
import {
  EXPORT_KEYWORD,
  IMPLICIT_CALLERS,
  MODULE_SCOPED_LANGS,
  checkGuardStyle,
  checkMetrics,
} from "./rules-file-checks.mjs";
import {
  checkStatelessMethod,
  enclosingClass,
} from "./rules-file-stateless.mjs";
import { push } from "./violations.mjs";

function unusedCandidate({ file, fn, context }) {
  const guards = [
    !MODULE_SCOPED_LANGS.has(file.lang),
    file.isTest,
    IMPLICIT_CALLERS.has(fn.name),
    EXPORT_KEYWORD.test(
      context.code.slice(Math.max(0, fn.headerStart - 40), fn.headerStart),
    ),
    enclosingClass(context.spans, fn) !== null,
  ];
  return !guards.some(Boolean);
}

function referenceCount(fn, context) {
  const references =
    context.code.match(new RegExp(`\\b${fn.name}\\b`, "g")) ?? [];
  const captureRefs = context.interpolations.filter(
    (id) => id.name === fn.name,
  ).length;
  return references.length + captureRefs;
}

function checkUnusedLocal({ file, config, fn, context, out }) {
  if (
    !unusedCandidate({ file, fn, context }) ||
    referenceCount(fn, context) > 1
  )
    return;
  const severity = config.presence["unused-local"];
  push({
    out,
    file,
    line: fn.line,
    rule: "unused-local",
    severity,
    message: `${fn.name}() is never called in this file and is not exported`,
    metric: 1,
  });
}

function checkFunction({ file, config, fn, context, out }) {
  const metrics = {
    complexity: complexityOf(fn.body, file.lang),
    length: functionLines(fn, context.starts),
    nesting: maxNesting(fn),
    params: fn.params.length,
  };
  const input = { file, config, fn, out };
  checkMetrics({ ...input, metrics });
  checkGuardStyle(input);
  checkStatelessMethod({ file, config, fn, context, out });
  checkUnusedLocal({ file, config, fn, context, out });
}

export { checkFunction };
