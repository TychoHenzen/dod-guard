// Reads the `## Acceptance criteria` checklist of an issue body. complete-pr
// closure and review-pr slots both read criteria, so one parser owns the rule.
// Every function is pure.

function lines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n");
}

// Returns the text under one level-two heading, up to the next level-two heading.
// The heading is data, so its regex specials are escaped before the match.
function markdownSection(body, heading) {
  const text = lines(body);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = text.search(new RegExp(`^## ${escaped}[ \\t]*$`, "m"));
  if (start < 0) return "";
  const newline = text.indexOf("\n", start);
  // With no line break after the heading there is no section text. Without this
  // guard the slice would restart at index 0 and return the text above the heading.
  if (newline < 0) return "";
  const rest = text.slice(newline + 1);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

// A checkbox item at any indent, checked ([x] or [X]) or not ([ ]).
const CHECKBOX_ITEM = /^\s*- \[([ xX])\](.*)$/;

// Returns every checkbox item under `## Acceptance criteria`, in document
// order, as { text, checked }.
function acceptanceCriteria(body) {
  return markdownSection(body, "Acceptance criteria")
    .split("\n")
    .map((line) => CHECKBOX_ITEM.exec(line))
    .filter((match) => match !== null)
    .map(([, mark, text]) => ({ text: text.trim(), checked: mark !== " " }));
}

export { acceptanceCriteria, markdownSection };
