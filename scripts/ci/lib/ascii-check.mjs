// scripts/ci must stay ASCII: non-ASCII text gets double-encoded on the
// owner's machine (UTF-8 read back as cp1252) and silently corrupts files.
// Pure so other guards (for example the #892 bundle check) can reuse it.

const MAX_ASCII = 0x7e;
const HEX_RADIX = 16;
// U+ notation pads to at least four hex digits and never truncates, so
// astral code points print five or six (U+1F600, U+10FFFF).
const MIN_HEX_DIGITS = 4;

export function findNonAscii({ path, text }) {
  const rows = [];
  // Splitting on LF alone keeps CRLF line numbers right; CR is ASCII.
  text.split("\n").forEach((line, index) => {
    // for...of walks code points, so an astral character is one row.
    for (const char of line) {
      const codePoint = char.codePointAt(0);
      if (codePoint > MAX_ASCII) {
        const hex = codePoint.toString(HEX_RADIX).toUpperCase().padStart(MIN_HEX_DIGITS, "0");
        rows.push(`${path}:${index + 1} U+${hex}`);
      }
    }
  });
  return rows;
}
