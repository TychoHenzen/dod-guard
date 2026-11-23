import { fitScanner } from "./scanner-summary.mjs";

// The deferred and minor entries of the review body, and the fit that chooses
// which of them the body has room for.

// Room kept for the omission note, which the body adds after the fit.
const NOTES_RESERVE = 1000;

function minorText(finding) {
  const location = `\`${finding.file}:${finding.line}\``;
  return { scanner: finding.scanner, text: ["", location, finding.body].join("\n") };
}

// A deferred judged finding keeps its full text, like a minor note, so deferring
// it never loses its evidence. A deferred scanner group keeps one line, its
// location and headline: its full list is in the scanner comments.
function deferredEntry(finding) {
  if (!finding.scanner) {
    return minorText(finding);
  }
  return { scanner: true, text: `\`${finding.file}:${finding.line}\` ${finding.body.split("\n")[0]}` };
}

// Deferred findings and minor notes share the `room` the rest of the body
// leaves, so a plan with many slots or a move with many flagged files still
// posts. Judged entries always render, so their text is counted first. A
// scanner group, deferred or minor, renders only while there is room: the
// scanner comments list them all.
function fitSections(room, { deferred, minor }) {
  const entries = { deferred: deferred.map(deferredEntry), minor: minor.map(minorText) };
  const all = [...entries.deferred, ...entries.minor];
  const judged = all.filter((entry) => !entry.scanner).reduce((sum, entry) => sum + entry.text.length + 1, 0);
  const fitted = fitScanner(all, Math.max(0, room - judged - NOTES_RESERVE));
  const placed = new Set(fitted.placed);
  const texts = (list) => list.filter((entry) => placed.has(entry)).map(({ text }) => text);
  return { deferred: texts(entries.deferred), minor: texts(entries.minor), omitted: fitted.omitted };
}

export { fitSections };
