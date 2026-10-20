// Reads the `## Acceptance criteria` checklist of an issue body. complete-pr
// closure and review-pr slots both read criteria, so one parser owns the rule.
// issue-body-records and closure-records share its line and fence readers.
// Every function is pure.

function lines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n");
}

// A fence opens with three or more backticks or tildes and closes on a line of
// only the same character, at least as many (CommonMark). A backtick fence's
// info string cannot contain a backtick, so "```x```" does not open one.
const FENCE_OPEN = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function closesFence(text, open) {
  const fence = FENCE_CLOSE.exec(text)?.[1];
  return Boolean(fence) && fence[0] === open[0] && fence.length >= open.length;
}

// Marks each line with whether it sits inside a fenced code block. Fence lines
// count as fenced, so no heading or checkbox is read from an example.
function markedLines(text) {
  let open = null;
  return lines(text)
    .split("\n")
    .map((line) => {
      if (open !== null) {
        if (closesFence(line, open)) {
          open = null;
        }
        return { text: line, fenced: true };
      }
      open = FENCE_OPEN.exec(line)?.[1] ?? null;
      return { text: line, fenced: open !== null };
    });
}

function isHeading(line, title) {
  return !line.fenced && line.text.replace(/[ \t]+$/, "") === title;
}

// Returns the text under one level-two heading, up to the next level-two
// heading. Headings inside fenced code blocks are examples, not structure.
function markdownSection(body, heading) {
  const marked = markedLines(body);
  const start = marked.findIndex((line) => isHeading(line, `## ${heading}`));
  if (start < 0) {
    return "";
  }
  const rest = marked.slice(start + 1);
  const end = rest.findIndex((line) => !line.fenced && line.text.startsWith("## "));
  if (end < 0) {
    return rest.map((line) => line.text).join("\n");
  }
  return rest
    .slice(0, end)
    .map((line) => `${line.text}\n`)
    .join("");
}

// A checkbox item at any indent, checked ([x] or [X]) or not ([ ]).
const CHECKBOX_ITEM = /^\s*- \[([ xX])\](.*)$/;
const INDENTED = /^[ \t]+\S/;

// Returns every checkbox item under `## Acceptance criteria`, in document
// order, as { text, checked }. A checkbox inside a fenced example is skipped.
// An indented line after a checkbox line (a wrapped line or a nested bullet)
// belongs to that item and joins its text with a newline, up to the next
// checkbox item or the next unindented non-blank line. A nested checkbox is
// its own item. Fenced lines are never part of an item.
function acceptanceCriteria(body) {
  const items = [];
  let open = null;
  for (const line of markedLines(markdownSection(body, "Acceptance criteria"))) {
    if (line.fenced) {
      continue;
    }
    const match = CHECKBOX_ITEM.exec(line.text);
    if (match !== null) {
      open = { first: match[2].trim(), rest: [], checked: match[1] !== " " };
      items.push(open);
    } else if (open !== null && INDENTED.test(line.text)) {
      open.rest.push(line.text.trimEnd());
    } else if (line.text.trim() !== "") {
      open = null;
    }
  }
  return items.map(({ first, rest, checked }) => ({ text: [first, ...rest].join("\n"), checked }));
}

export { acceptanceCriteria, lines, markdownSection, markedLines };
