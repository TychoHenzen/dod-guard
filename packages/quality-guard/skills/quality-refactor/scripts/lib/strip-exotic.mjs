import {
  readQuoted,
  readRawCsBody,
  readRawCsOpener,
  readRawRust,
  readRustChar,
  readVerbatim,
} from "./strip-readers.mjs";

export const EXOTIC_STRINGS = {
  py: (src, i) => {
    const triple = src.slice(i, i + 3);
    if (triple !== '"""' && triple !== "'''") return null;
    return { end: readQuoted(src, i, triple), isComment: true };
  },
  cs: (src, i) => {
    if (src.startsWith('@"', i) || src.startsWith('$@"', i)) {
      const start = src[i] === "$" ? i + 1 : i;
      const end = readVerbatim(src, start);
      const captures = src[i] === "$" ? { braceCount: 1, escaped: true } : null;
      return { end, isComment: false, captures };
    }
    const opener = readRawCsOpener(src, i);
    if (opener) {
      const end = readRawCsBody(src, opener.end, opener.quoteCount);
      const captures =
        opener.dollarCount > 0
          ? { braceCount: opener.dollarCount, escaped: false }
          : null;
      return { end, isComment: false, captures };
    }
    if (src[i] === "$" && src[i + 1] === '"') {
      return {
        end: readQuoted(src, i + 1, '"'),
        isComment: false,
        captures: { braceCount: 1, escaped: true },
      };
    }
    return null;
  },
  rs: (src, i) => {
    if (src[i] === "'") {
      const end = readRustChar(src, i);
      return end === null ? null : { end, isComment: false };
    }
    if (src[i] !== "r") return null;
    const end = readRawRust(src, i);
    return end === null ? null : { end, isComment: false };
  },
};
