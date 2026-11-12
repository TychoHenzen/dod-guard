// Tracks whether a source line ends inside a string that can span lines. The state is the
// delimiter that opened the string, or null outside one. A comment-looking or re-indented line
// inside such a string is string content, so source-normalize.mjs compares it verbatim.
// ASSUMPTION: plain "..." and '...' strings are not tracked, so a multi-line Rust or C# plain
// string, or a backslash-continued string, reads as code lines. That is the documented limit.
const DELIMITERS = Object.freeze([
  { open: '"""', close: '"""', escapes: true },
  { open: "'''", close: "'''", escapes: true },
  { open: "`", close: "`", escapes: true },
  { open: '@"', close: '"', escapes: false },
  { open: 'r#"', close: '"#', escapes: false },
]);

function openingAt(line, index) {
  return DELIMITERS.find((delimiter) => line.startsWith(delimiter.open, index));
}

function hasOddBackslashes(line, end) {
  let count = 0;
  while (line[end - 1 - count] === "\\") {
    count += 1;
  }
  return count % 2 === 1;
}

// How many characters of an apparent closer are escaped: a backslash escapes one, and a
// doubled quote inside a C# verbatim string escapes two.
function doubledQuoteWidth(line, found, close) {
  if (close === '"' && line[found + 1] === '"') {
    return 2;
  }
  return 0;
}

function escapeWidth(line, found, { close, escapes }) {
  if (escapes) {
    return Number(hasOddBackslashes(line, found));
  }
  return doubledQuoteWidth(line, found, close);
}

function closeIndex(line, from, delimiter) {
  let index = from;
  while (index < line.length) {
    const found = line.indexOf(delimiter.close, index);
    if (found < 0) {
      return -1;
    }
    const skip = escapeWidth(line, found, delimiter);
    if (skip === 0) {
      return found;
    }
    index = found + skip;
  }
  return -1;
}

function advance(line, index, state) {
  if (state === null) {
    const opening = openingAt(line, index);
    if (opening === undefined) {
      return { state: null, index: index + 1 };
    }
    return { state: opening, index: index + opening.open.length };
  }
  const close = closeIndex(line, index, state);
  if (close < 0) {
    return { state, index: line.length };
  }
  return { state: null, index: close + state.close.length };
}

function stringStateAfter(line, state) {
  let current = { state, index: 0 };
  while (current.index < line.length) {
    current = advance(line, current.index, current.state);
  }
  return current.state;
}

export { stringStateAfter };
