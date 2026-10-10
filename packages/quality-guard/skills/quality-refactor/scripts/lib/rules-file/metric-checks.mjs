import { severityFor } from "../config.mjs";
import { push } from "../violations.mjs";
import { ifElseCount } from "./else-branches.mjs";

export function checkMetrics({ file, config, fn, metrics, out }) {
  const label = `${fn.name}()`;
  const report = (rule, value, text) =>
    push({
      out,
      file,
      line: fn.line,
      rule,
      severity: severityFor(config, rule, value),
      message: `${label} ${text}`,
      metric: value,
    });
  report("complexity", metrics.complexity, `cyclomatic complexity ${metrics.complexity}`);
  report("function-length", metrics.length, `is ${metrics.length} lines`);
  report("param-count", metrics.params, `takes ${metrics.params} parameters`);
  report("nesting-depth", metrics.nesting, `nests ${metrics.nesting} levels deep`);
}

export function checkGuardStyle({ file, config, fn, out }) {
  const elses = ifElseCount(fn.body, file.lang);
  if (elses === 0) {
    return;
  }
  push({
    out,
    file,
    line: fn.line,
    rule: "else-branch",
    severity: config.presence["else-branch"],
    message: `${fn.name}() has ${elses} if/else branch(es); review whether a guard clause or polymorphism reads better`,
    metric: elses,
  });
}
