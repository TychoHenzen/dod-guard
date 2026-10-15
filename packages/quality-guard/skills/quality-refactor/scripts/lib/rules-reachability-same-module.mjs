// Uses of an export inside its own module. Self-references (the declaration,
// an export list, a binding, the symbol's own body) and names a parameter
// shadows are not uses: recursion, constructors, re-export lines and a
// same-named parameter would otherwise hide a test-only symbol.
import { lineAt } from "./offsets.mjs";
import { EXPORT_BLOCK } from "./rules-reachability-exports.mjs";
import {
  inside,
  isBinding,
  ownExtent,
} from "./rules-reachability-own-extent.mjs";
import { shadowingRanges } from "./rules-reachability-shadows.mjs";

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

// `ranges` holds the symbol's own extent and every function whose parameter
// shadows its name: an occurrence in either refers to something else.
function isUse(offset, context) {
  const { code, own, ranges, lists } = context;
  if (offset === own.offset) return false;
  if (ranges.some((range) => inside(range, offset))) return false;
  if (lists.some((list) => inside(list, offset))) return false;
  return !isBinding(code, offset);
}

function touchesLine(scan, range, line) {
  const first = lineAt(scan.starts, range.start);
  return first <= line && line <= lineAt(scan.starts, range.end);
}

// ASSUMPTION: a capture records only its line, so one on any line a range
// touches is treated as inside it. Erring that way keeps reporting.
function captureUses(captures, scan, ranges) {
  return captures.filter(
    (id) => !ranges.some((range) => touchesLine(scan, range, id.line)),
  ).length;
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
  const shadows = shadowingRanges(scan, file.lang, own.name);
  const ranges = [extent, ...shadows];
  const context = { code: scan.code, own, ranges, lists: exportLists(scan) };
  const codeUses = occurrences.filter((offset) => isUse(offset, context));
  return codeUses.length + captureUses(captures, scan, ranges);
}
