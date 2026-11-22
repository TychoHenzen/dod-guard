const LEADING_WHITESPACE = /^[ \t]*/;
const TAB = /\t/g;

// Strings and comments are blank, so every bracket counted here is code. A
// stray closer is clamped at zero so it cannot hide every later line.
function bracketDepthAfter(text, depth) {
  let open = depth;
  for (const ch of text) {
    open += Number("([{".includes(ch));
    open = Math.max(0, open - Number(")]}".includes(ch)));
  }
  return open;
}

export function indentOf(line) {
  const match = LEADING_WHITESPACE.exec(line);
  return match[0].replace(TAB, "    ").length;
}

// Python blocks are made of logical lines. A physical line that begins inside
// an open bracket, after a backslash, or inside a multi-line string continues
// the line above it, so its indentation says nothing about blocks. Each entry
// is the raw indentation of the logical line starting there, or null. The
// indentation comes from the raw source because a line can open with a string,
// and blanking turns that string into what looks like more indentation.
export function logicalIndents(lines, source, literalLines) {
  const sourceLines = source.split("\n");
  let depth = 0;
  let joined = false;
  return lines.map((text, index) => {
    const opens = depth === 0 && !joined && !literalLines.has(index + 1);
    depth = bracketDepthAfter(text, depth);
    joined = text.trimEnd().endsWith("\\");
    if (!opens || text.trim() === "") {
      return null;
    }
    return indentOf(sourceLines[index]);
  });
}
