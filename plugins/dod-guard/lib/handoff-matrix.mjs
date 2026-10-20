// Reads the acceptance matrix of a next-ticket implementation handoff. The
// matrix is one JSON array in a fenced json block under `## Acceptance matrix`,
// not a markdown table: the post-push proof and the handoff comment must agree
// on one matrix, and a table beside a block would be two copies that drift
// apart. A table-only matrix is therefore reported as a missing block. Every
// function is pure; fetching the handoff comment belongs to the callers.
import { lines, markdownSection } from "./acceptance-criteria.mjs";
import { jsonBlock } from "./issue-body-records.mjs";

// Returns { rows } with the matrix rows, else { error } naming what is wrong.
function readHandoffMatrix(text) {
  const section = markdownSection(lines(text), "Acceptance matrix");
  if (section === "") {
    return { error: "handoff has no ## Acceptance matrix section" };
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
