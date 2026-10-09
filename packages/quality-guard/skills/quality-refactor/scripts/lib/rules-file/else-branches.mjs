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

function countPython(body) {
  const lines = body.split("\n");
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(ELSE)) {
      const before = lines[index].slice(0, match.index);
      // ASSUMPTION: an else after code on its line is the inline conditional
      // "a if c else b", which is an if form, so it stays counted to keep the
      // current behavior.
      if (before.trim() !== "" || ownedByIf(lines, index)) {
        count += 1;
      }
    }
  }
  return count;
}

// The else at lines[index] belongs to an if or elif when the nearest earlier
// non-blank line at its indentation or shallower is that if. Deeper lines are
// the if's own body or a condition continued onto the next line, so skip them.
function ownedByIf(lines, index) {
  const indent = indentOf(lines[index]);
  const owner = lines
    .slice(0, index)
    .findLast((line) => line.trim() !== "" && indentOf(line) <= indent);
  return owner !== undefined && indentOf(owner) === indent && IF_HEAD.test(owner);
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
