// esbuild's charset "ascii" escapes strings and identifiers but copies preserved
// comments verbatim, so a bundle can still carry raw non-ASCII. Escaping the rest
// here keeps tracked bundles ASCII on a machine that double-encodes UTF-8.
// ASSUMPTION: after esbuild, raw non-ASCII only survives inside comments, where an
// escape sequence is inert text. The tracked-bundle guard test catches any other case.
const NON_ASCII = /[\u0080-\uffff]/g;
const HEX_RADIX = 16;
const ESCAPE_DIGITS = 4;

export function escapeNonAscii(text) {
  return text.replace(
    NON_ASCII,
    (unit) => `\\u${unit.charCodeAt(0).toString(HEX_RADIX).padStart(ESCAPE_DIGITS, "0")}`,
  );
}
