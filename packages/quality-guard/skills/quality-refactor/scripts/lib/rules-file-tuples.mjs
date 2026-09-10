import { lineAt } from "./offsets.mjs";
import { severityFor } from "./config.mjs";
import { push } from "./violations.mjs";

const TS_TYPE_POSITION =
  "(?:\\)\\s*:|\\b(?:const|let|var|readonly)\\s+[\\w$]+\\s*:|" +
  "\\btype\\s+[\\w$]+\\s*=)";
const TYPE_ELEMENT =
  "(?:[A-Za-z_$][\\w$]*\\??\\s*:\\s*)?[A-Za-z_$][\\w$.<>|& \\[\\]]*";
const TUPLE_LITERAL =
  `\\[\\s*${TYPE_ELEMENT}\\s*` + `(?:,\\s*${TYPE_ELEMENT}\\s*)+\\]`;
const TUPLE_PATTERNS = {
  ts: new RegExp(
    `${TS_TYPE_POSITION}\\s*(?:readonly\\s+)?${TUPLE_LITERAL}`,
    "g",
  ),
  cs: new RegExp(
    String.raw`\((?:[\w.<>[\]?]+(?:\s+\w+)?\s*,\s*)+` +
      String.raw`[\w.<>[\]?]+(?:\s+\w+)?\)\s+\w+\s*\(`,
    "g",
  ),
  rs: /->\s*\([^)\n]*,[^)\n]*\)/g,
  py: /:\s*[Tt]uple\[[^\]\n]*,/g,
};

export function checkTuples({ file, config, code, starts, out }) {
  const pattern = TUPLE_PATTERNS[file.lang];
  if (!pattern) return;
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match !== null) {
    const line = lineAt(starts, match.index);
    const message =
      `tuple ${match[0].trim()} ` + "\u2014 replace it with a named type";
    push({
      out,
      file,
      line,
      rule: "unnamed-tuple",
      severity: config.presence["unnamed-tuple"],
      message,
      metric: 1,
    });
    match = pattern.exec(code);
  }
}
