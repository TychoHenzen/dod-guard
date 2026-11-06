// GitHub attaches an inline review comment only to a line the diff shows: a line it adds (side RIGHT) or a
// line it removes (side LEFT). A finding goes on its own file first, so a file the PR only trims still gets
// a thread on that file and its GH-<id>.

function nearestLine(lines, wanted) {
  return [...lines].reduce((best, line) => (Math.abs(line - wanted) < Math.abs(best - wanted) ? line : best));
}

function place(path, line, side) {
  return { path, line, side };
}

function firstOf(byFile, side) {
  for (const [file, lines] of byFile) {
    if (lines.size > 0) {
      return place(file, Math.min(...lines), side);
    }
  }
  return null;
}

function firstAnchor({ added, removed }) {
  return firstOf(added, "RIGHT") ?? firstOf(removed, "LEFT");
}

function ownAnchor(finding, { added, removed }) {
  const adds = added.get(finding.file);
  const cuts = removed.get(finding.file);
  if (adds?.size > 0) {
    return place(finding.file, nearestLine(adds, finding.line), "RIGHT");
  }
  if (cuts?.size > 0) {
    return place(finding.file, nearestLine(cuts, finding.line), "LEFT");
  }
  return null;
}

function relocated(chosen, finding) {
  return chosen.side === "LEFT" || chosen.path !== finding.file || chosen.line !== finding.line;
}

function citedNote(finding, chosen) {
  const cited = `\n\nCited location: \`${finding.file}:${finding.line}\``;
  if (chosen.side === "LEFT" && chosen.path === finding.file) {
    return `${cited}. This PR only removes lines from this file, so the comment sits on the nearest removed line.`;
  }
  return `${cited}, which is outside the lines this PR changes.`;
}

// A caller passes no fallback for a finding that must not leave its file.
function anchor(finding, lines, fallback) {
  const chosen = ownAnchor(finding, lines) ?? fallback;
  if (!chosen) {
    return { ...finding, anchored: null };
  }
  const body = relocated(chosen, finding) ? finding.body + citedNote(finding, chosen) : finding.body;
  return { ...finding, anchored: chosen, body };
}

// A BLOCKER or MAJOR finding without a thread has no GH-<id>, so /fix-pr-review could not select it.
function requireAnchored(findings) {
  const loose = findings.filter((finding) => finding.severity !== "MINOR" && !finding.anchored);
  if (loose.length === 0) {
    return findings;
  }
  const cited = loose.map(({ file, line }) => `${file}:${line}`).join(", ");
  throw new Error(
    `No diff line can hold an inline comment for ${loose.length} BLOCKER or MAJOR finding(s): ${cited}. ` +
      "Nothing was posted; GitHub attaches a review thread only to a line the diff adds or removes.",
  );
}

export { anchor, firstAnchor, requireAnchored };
