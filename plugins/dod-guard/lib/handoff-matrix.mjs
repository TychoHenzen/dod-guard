// Reads the acceptance matrix of a next-ticket implementation handoff. The
// matrix is one JSON array in a fenced json block under `## Acceptance matrix`,
// not a markdown table: the post-push proof and the handoff comment must agree
// on one matrix, and a table beside a block would be two copies that drift
// apart. A table-only matrix is therefore reported as a missing block. Every
// function is pure; fetching the handoff comment belongs to the callers.
import { lines, markdownSection, markedLines } from "./acceptance-criteria.mjs";
import { jsonBlock } from "./issue-body-records.mjs";

const MATRIX_HEADING = "## Acceptance matrix";

// A second heading would be a second matrix, and the proof would read only the
// first, so two headings are refused instead of one being silently ignored.
function matrixHeadingCount(text) {
  return markedLines(text).filter((line) => !line.fenced && line.text.trimEnd() === MATRIX_HEADING).length;
}

// Returns { rows } with the matrix rows, else { error } naming what is wrong.
function readHandoffMatrix(text) {
  if (matrixHeadingCount(text) > 1) {
    return { error: `handoff has more than one ${MATRIX_HEADING} section` };
  }
  const section = markdownSection(lines(text), "Acceptance matrix");
  if (section === "") {
    return { error: `handoff has no ${MATRIX_HEADING} section` };
  }
  const block = jsonBlock(section);
  if (block.error) {
    return { error: `acceptance matrix ${block.error}` };
  }
  if (!Array.isArray(block.value)) {
    return { error: "acceptance matrix is not a JSON array" };
  }
  return { rows: block.value };
}

export { readHandoffMatrix };
