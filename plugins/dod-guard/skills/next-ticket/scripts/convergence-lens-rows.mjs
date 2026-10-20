import { normalizedIdentifier } from "./convergence-core.mjs";
import {
  LENS_ROW_KINDS,
  ownerDeclarationErrors,
  resolveLensRows,
  rowKey,
  sameRows,
} from "./convergence-row-resolve.mjs";

// The user paths a lens must prove through rows it owns: wiring/usability is
// the user's own path through the surface, reliability is failure and recovery.
const REQUIRED_LENS_PATHS = Object.freeze({
  "wiring/usability": ["interactive-control", "browser/e2e"],
  reliability: ["data/error", "recovery"],
});

// A lens row must name its required path exactly, ignoring case, as the
// finalization gate did on master. The matrix coverage check in
// acceptance-matrix.mjs also accepts substrings and aliases, so a row such as
// "Recovery after restart" covers the matrix's recovery path but not the
// reliability lens's. Planned and observed mode apply the same two rules, so
// refinement and finalization still agree.
function lensPathErrors(id, rows) {
  const missing = (REQUIRED_LENS_PATHS[id] ?? []).filter(
    (requiredPath) => !rows.some((row) => row.path?.toLowerCase() === requiredPath),
  );
  if (missing.length === 0) {
    return [];
  }
  return [`${id} review lens must cover required path(s): ${missing.join(", ")}`];
}

// Returns the message when another lens already owns the row, else null after
// recording this lens as the owner.
function claimRow(id, row, claimedRows) {
  const previousLens = claimedRows.get(rowKey(row));
  if (previousLens && previousLens !== id) {
    return `${id} review lens reuses acceptance-matrix row ${rowKey(row)} already owned by ${previousLens}`;
  }
  claimedRows.set(rowKey(row), id);
  return null;
}

function claimRows(id, rows, claimedRows) {
  return rows.map((row) => claimRow(id, row, claimedRows)).filter(Boolean);
}

function storedHeadSha(lens) {
  return normalizedIdentifier(lens.headSha ?? lens.head);
}

function storedHeadProblem({ id, lens, expectedHeadSha }) {
  const storedHead = storedHeadSha(lens);
  if (!(expectedHeadSha && storedHead)) {
    return null;
  }
  if (storedHead === expectedHeadSha) {
    return null;
  }
  return `${id} review lens is not bound to handoff head ${expectedHeadSha}`;
}

// Checks one owned lens against the matrix rows. The row errors come after the
// owner-declaration errors, and the claim is recorded only when the rows resolve.
function lensRemainder({ owned, rows, observed, expectedHeadSha, claimedRows }) {
  const { id, lens, ownerTask } = owned;
  const remainder = [];
  const headProblem = storedHeadProblem({ id, lens, expectedHeadSha });
  if (headProblem) {
    remainder.push(headProblem);
  }
  remainder.push(...LENS_ROW_KINDS.flatMap((kind) => ownerDeclarationErrors({ id, kind, lens, ownerTask })));
  const [acceptance, verification] = LENS_ROW_KINDS.map((kind) =>
    resolveLensRows({ id, kind, lens, rows, observed, expectedHeadSha }),
  );
  remainder.push(...acceptance.errors, ...verification.errors);
  if (acceptance.errors.length > 0 || verification.errors.length > 0) {
    return remainder;
  }
  if (!sameRows(acceptance.rows, verification.rows)) {
    remainder.push(`${id} review lens acceptance and verification evidence must share one acceptance-matrix row`);
    return remainder;
  }
  remainder.push(...lensPathErrors(id, acceptance.rows), ...claimRows(id, acceptance.rows, claimedRows));
  return remainder;
}

// The one lens-row rule set. Every owned lens must cite rows its owner task
// declares, resolve each reference to exactly one row, use one row for both
// its acceptance and verification evidence, cover its required user paths,
// and claim no row another lens owns. Observed rows must also pass at the
// pushed head; planned rows have no status or head to check yet.
function lensRowRemainder({ ownedLenses, rows, observed, expectedHeadSha }) {
  const claimedRows = new Map();
  return ownedLenses.flatMap((owned) => lensRemainder({ owned, rows, observed, expectedHeadSha, claimedRows }));
}

export { lensRowRemainder };
