export function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

export function readLineComment(src, start) {
  const end = src.indexOf("\n", start);
  return end === -1 ? src.length : end;
}

export function readBlockComment(src, start) {
  const end = src.indexOf("*/", start + 2);
  return end === -1 ? src.length : end + 2;
}

export function readQuoted(src, start, quote) {
  let i = start + quote.length;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src.startsWith(quote, i)) return i + quote.length;
    i += 1;
  }
  return src.length;
}

export function readVerbatim(src, start) {
  let i = start + 2;
  while (i < src.length) {
    if (src[i] !== '"') {
      i += 1;
      continue;
    }
    if (src[i + 1] === '"') {
      i += 2;
      continue;
    }
    return i + 1;
  }
  return src.length;
}

export function readRawCsOpener(src, i) {
  let j = i;
  while (src[j] === "$") j += 1;
  const dollarCount = j - i;
  let quotes = 0;
  while (src[j + quotes] === '"') quotes += 1;
  return quotes < 3
    ? null
    : { end: j + quotes, quoteCount: quotes, dollarCount };
}

export function readRawCsBody(src, start, quoteCount) {
  let i = start;
  while (i < src.length) {
    if (src[i] !== '"') {
      i += 1;
      continue;
    }
    let run = 0;
    while (src[i + run] === '"') run += 1;
    if (run >= quoteCount) return i + run;
    i += run;
  }
  return src.length;
}

export function readRawRust(src, start) {
  const opener = /^r(#*)"/.exec(src.slice(start, start + 16));
  if (!opener) return null;
  const terminator = `"${opener[1]}`;
  const end = src.indexOf(terminator, start + opener[0].length);
  return end === -1 ? src.length : end + terminator.length;
}

function rustUnicodeChar(src, backslash) {
  const close = src.indexOf("}", backslash + 3);
  return close !== -1 && src[close + 1] === "'" ? close + 2 : null;
}

function rustEscapeChar(src, index) {
  if (src[index + 1] === "u" && src[index + 2] === "{")
    return rustUnicodeChar(src, index);
  return src[index + 2] === "'" ? index + 3 : null;
}

export function readRustChar(src, i) {
  const next = i + 1;
  if (src[next] === "\\") return rustEscapeChar(src, next);
  return src[next + 1] === "'" ? next + 2 : null;
}
