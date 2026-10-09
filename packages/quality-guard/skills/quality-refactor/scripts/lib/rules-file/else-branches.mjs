// Counts the "else" tokens in a function body that close an if branch. Rust and
// Python also spell other constructs with "else" (let-else, loop else, try
// else), so only those two languages filter. The body is the stripped source,
// so comments and string contents are already blank.
const ELSE = /\belse\b/g;
const SPACE = /\s/;
const LEADING = /^[ \t]*/;
const IF_HEAD = /^\s*(?:if|elif)\b/;

function countRust(body) {
  let count = 0;
  for (const match of body.matchAll(ELSE)) {
    // ASSUMPTION: Rust requires braces on every if branch, so an if-else always
    // reads "} else", while a let-else initializer can never end in "}" (the
    // Rust reference forbids it). Keeping only "}"-preceded tokens keeps the if
    // form.
    if (previousNonSpace(body, match.index) === "}") {
      count += 1;
    }
  }
  return count;
}

// Python finds a clause header by indentation. The bracket depth says which
// lines open inside brackets, so continuation lines and a Black-style closing
// "):" are never taken for a header.
function countPython(body) {
  const depth = bracketDepths(body);
  const lines = [];
  let start = 0;
  for (const text of body.split("\n")) {
    lines.push({ text, start, depth: depth[start] });
    start += text.length + 1;
  }
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const { text, start: lineStart } = lines[index];
    for (const match of text.matchAll(ELSE)) {
      const inside = depth[lineStart + match.index] > 0;
      const inline = text.slice(0, match.index).trim() !== "";
      // ASSUMPTION: an else inside brackets, or after code on its line, is the
      // conditional expression "a if c else b", an if form, so it stays counted
      // to keep the current behavior.
      if (inside || inline || ownedByIf(lines, index)) {
        count += 1;
      }
    }
  }
  return count;
}

// Only a line that starts at bracket depth 0 can hold a clause header. Lines
// that start inside brackets are continuations, so the search skips them and
// keeps going up to the if or for that owns this else.
function ownedByIf(lines, index) {
  const indent = indentOf(lines[index].text);
  const owner = lines
    .slice(0, index)
    .findLast(
      (line) =>
        line.depth === 0 && line.text.trim() !== "" && indentOf(line.text) <= indent,
    );
  return (
    owner !== undefined &&
    indentOf(owner.text) === indent &&
    IF_HEAD.test(owner.text)
  );
}

// depth[i] is the bracket depth in front of body[i]. Strings and comments are
// blank, so every bracket counted here is code. A stray closer is clamped at
// zero so one unbalanced bracket cannot push every later line off depth 0.
function bracketDepths(body) {
  const depth = new Int32Array(body.length + 1);
  let open = 0;
  for (let i = 0; i < body.length; i += 1) {
    depth[i] = open;
    if ("([{".includes(body[i])) {
      open += 1;
    }
    if (")]}".includes(body[i])) {
      open = Math.max(0, open - 1);
    }
  }
  depth[body.length] = open;
  return depth;
}

// Tabs count as four columns, the width parse-python.mjs uses to find where a
// function body ends, so both agree on which lines are nested.
function indentOf(line) {
  return LEADING.exec(line)[0].replaceAll("\t", "    ").length;
}

// Returns "" when only whitespace precedes index.
function previousNonSpace(body, index) {
  let at = index - 1;
  while (at >= 0 && SPACE.test(body[at])) {
    at -= 1;
  }
  return body.charAt(at);
}

// Only Rust and Python need a language-specific filter; every other language
// counts each else token, as the scanner always has.
export function ifElseCount(body, lang) {
  if (lang === "rs") {
    return countRust(body);
  }
  if (lang === "py") {
    return countPython(body);
  }
  return [...body.matchAll(ELSE)].length;
}
