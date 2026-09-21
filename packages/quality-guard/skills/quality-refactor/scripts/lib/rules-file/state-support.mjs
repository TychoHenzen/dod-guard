const STATIC_OR_CONST = /\bconst\b|(?<!')\bstatic\b/;

export const MODULE_SCOPED_LANGS = new Set(["ts", "rs"]);
export const EXPORT_KEYWORD = /\b(export|pub)\b/;
export const IMPLICIT_CALLERS = new Set([
  "main",
  "constructor",
  "default",
  "setup",
  "teardown",
]);

export function isStatic(code, headerStart) {
  return STATIC_OR_CONST.test(
    code.slice(Math.max(0, headerStart - 60), headerStart),
  );
}
