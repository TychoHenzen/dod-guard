import { BODY_TEXT, LENSES_904, ROWS_904 } from "./handoff-proof-harness.mjs";

export const UNPUSHED_HEAD = "cccccccccccccccccccccccccccccccccccccccc";
export const HEAD_B = "1111111111111111111111111111111111111111";
const LENS_OWNERSHIP_BLOCK = /### lens-ownership\r?\n[\s\S]*?```json\r?\n([\s\S]*?)\r?\n```/;
const STALE_LENS = /review lens is not bound to handoff head/;

export function bodyWithLensRecords(transform) {
  const [, block] = LENS_OWNERSHIP_BLOCK.exec(BODY_TEXT);
  const records = JSON.parse(block).map(transform);
  return BODY_TEXT.replace(block, JSON.stringify(records, null, 2));
}

export const headless = ({ headSha, ...lens }) => lens;
export const firstLensStores = (head) => (lens, index) =>
  index === 0 ? { ...headless(lens), headSha: head } : headless(lens);

// Every row and every lens evidence value the #904 handoff binds to `actual`,
// as the proof reports them when `expected` is the head under test.
export function staleAt(actual, expected) {
  const rows = ROWS_904.map((row) => `acceptance matrix: ${row.id} is bound to head ${actual}, expected ${expected}`);
  const lenses = LENSES_904.flatMap((lens) =>
    ["acceptance", "verification"].flatMap((kind) =>
      lens[`${kind}Evidence`].map(
        (value) => `${lens.id} review lens ${kind} evidence ${value} is bound to ${actual}, expected ${expected}`,
      ),
    ),
  );
  return [...rows, ...lenses];
}

export const staleLensEntries = (json) => json.remainder.filter((entry) => STALE_LENS.test(entry));
