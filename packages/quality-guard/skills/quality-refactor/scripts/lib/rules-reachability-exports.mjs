const TS_DECL = "class|interface|enum|type|function|const|let|var";
const TS_EXPORT = new RegExp(
  `export\\s+(?:default\\s+)?(?:async\\s+)?` +
    `(?:abstract\\s+)?(?:${TS_DECL})\\s+([A-Za-z_$][\\w$]*)`,
  "g",
);
const CS_MODIFIERS = "static|abstract|sealed|partial|readonly";
const CS_EXPORT = new RegExp(
  `public\\s+(?:(?:${CS_MODIFIERS})\\s+)*` +
    `(?:class|interface|struct|enum|record)\\s+(\\w+)`,
  "g",
);

export const EXPORT_PATTERNS = {
  ts: [TS_EXPORT],
  cs: [CS_EXPORT],
  rs: [
    new RegExp(
      String.raw`pub(?:\([^)]*\))?\s+(?:async\s+)?` +
        String.raw`(?:fn|struct|enum|trait|const|static|type)\s+(\w+)`,
      "g",
    ),
  ],
  go: [/func\s+([A-Z]\w*)\s*\(/g, /type\s+([A-Z]\w*)\s/g],
  java: [
    new RegExp(
      String.raw`public\s+(?:static\s+|abstract\s+|final\s+)*` +
        String.raw`(?:class|interface|enum|record)\s+(\w+)`,
      "g",
    ),
  ],
  py: [/^(?:async\s+)?def\s+([a-zA-Z]\w*)/gm, /^class\s+([A-Za-z]\w*)/gm],
};
