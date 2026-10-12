// Reads the `## Acceptance criteria` checklist of an issue body. complete-pr
// closure and review-pr slots both read criteria, so one parser owns the rule.
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
  const end = rest.findIndex(
    (line) => !line.fenced && line.text.startsWith("## "),
  );
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

// Returns every checkbox item under `## Acceptance criteria`, in document
// order, as { text, checked }. A checkbox inside a fenced example is skipped.
function acceptanceCriteria(body) {
  return markedLines(markdownSection(body, "Acceptance criteria"))
    .filter((line) => !line.fenced)
    .map((line) => CHECKBOX_ITEM.exec(line.text))
    .filter((match) => match !== null)
    .map(([, mark, text]) => ({ text: text.trim(), checked: mark !== " " }));
}

export { acceptanceCriteria, markdownSection };
