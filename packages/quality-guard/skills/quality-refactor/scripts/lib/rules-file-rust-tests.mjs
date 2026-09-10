import { matchBracket } from "./offsets.mjs";

const CFG_TEST_PLAIN = /#\[cfg\(test\)\]/g;
const CFG_TEST_ALL = /#\[cfg\(all\(([^()]*)\)\)\]/g;

function cfgTestAttributeEnds(code) {
  const ends = [];
  for (const pattern of [CFG_TEST_PLAIN, CFG_TEST_ALL]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(code);
    while (match !== null) {
      if (pattern === CFG_TEST_PLAIN || /\btest\b/.test(match[1]))
        ends.push(match.index + match[0].length);
      match = pattern.exec(code);
    }
  }
  return ends;
}

function itemSpanEnd(code, from) {
  for (let i = from; i < code.length; i += 1) {
    if (code[i] === "{") return matchBracket(code, i, "{}");
    if (code[i] === ";") return i;
  }
  return -1;
}

export function findRustTestRegions(code) {
  const regions = [];
  for (const attrEnd of cfgTestAttributeEnds(code)) {
    const end = itemSpanEnd(code, attrEnd);
    if (end !== -1) regions.push({ start: attrEnd, end });
  }
  return regions.sort((left, right) => left.start - right.start);
}

export function inTestRegion(regions, offset) {
  return regions.some(
    (region) => offset >= region.start && offset <= region.end,
  );
}
