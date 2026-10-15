// Uses of an export inside its own module. Self-references (the declaration,
// an export list, a binding, the symbol's own body) are not uses: recursion,
// constructors and re-export lines would otherwise hide a test-only symbol.
import { lineAt } from "./offsets.mjs";
import { EXPORT_BLOCK } from "./rules-reachability-exports.mjs";
import {
  inside,
  isBinding,
  ownExtent,
} from "./rules-reachability-own-extent.mjs";

const listsByScan = new WeakMap();

function exportLists(scan) {
  let lists = listsByScan.get(scan);
  if (lists === undefined) {
    lists = [...scan.code.matchAll(EXPORT_BLOCK)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length - 1,
    }));
    listsByScan.set(scan, lists);
  }
  return lists;
}

// An export-list name has no declaration offset, so its binding stands in.
function declarationOffset(code, occurrences, own) {
  if (own.offset >= 0) return own.offset;
  return occurrences.find((offset) => isBinding(code, offset)) ?? -1;
}

function isUse(offset, context) {
  const { code, own, extent, lists } = context;
  if (offset === own.offset || inside(extent, offset)) return false;
  if (lists.some((list) => inside(list, offset))) return false;
  return !isBinding(code, offset);
}

// ASSUMPTION: a capture records only its line, so one on any line the
// extent touches is treated as inside it. Erring that way keeps reporting.
function captureUses(captures, scan, extent) {
  const first = lineAt(scan.starts, extent.start);
  const last = lineAt(scan.starts, extent.end);
  return captures.filter((id) => id.line < first || id.line > last).length;
}

/**
 * Counts production uses of `own.name` in its defining file. Returns 0 when
 * the symbol's own body cannot be found, which keeps the old file-blind
 * result rather than guessing which mentions are self-references.
 */
export function sameModuleUses({ pattern, entry, own, captures }) {
  const { file, scan } = entry;
  const occurrences = [...scan.code.matchAll(pattern)].map(
    (match) => match.index,
  );
  const at = declarationOffset(scan.code, occurrences, own);
  if (at < 0) return 0;
  const extent = ownExtent({ file, scan, name: own.name, at });
  if (extent === null) return 0;
  const lists = exportLists(scan);
  const context = { code: scan.code, own, extent, lists };
  const codeUses = occurrences.filter((offset) => isUse(offset, context));
  return codeUses.length + captureUses(captures, scan, extent);
}
