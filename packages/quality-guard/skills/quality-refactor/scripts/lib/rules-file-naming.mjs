import { lineAt } from "./offsets.mjs";
import { encodedMemberMatches } from "./rules-file-naming-support.mjs";
import { push } from "./violations.mjs";

export function checkNamingEncodings({ file, config, code, starts, spans, out }) {
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
