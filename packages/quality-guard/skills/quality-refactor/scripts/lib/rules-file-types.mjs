import { severityFor } from "./config.mjs";
import { checkNamingEncodings } from "./rules-file-naming.mjs";
import { push } from "./violations.mjs";

export function checkTypes({ file, config, types, code, starts, spans, out }) {
  checkNamingEncodings({ file, config, code, starts, spans, out });
  if (types.length <= 1) return;
  const names = types.map((type) => type.name).join(", ");
  const severity = severityFor(config, "types-per-file", types.length);
  push({
    out,
    file,
    line: types[1].line,
    rule: "types-per-file",
    severity,
    message: `${types.length} types in one file: ${names}`,
    metric: types.length,
  });
}
