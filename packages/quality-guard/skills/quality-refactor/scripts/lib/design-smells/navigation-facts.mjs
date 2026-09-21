import { lineAt, lineIndex } from "../offsets.mjs";
import { findFunctions } from "../parse.mjs";
import { strip } from "../strip.mjs";

const CHAIN =
  /\b(?:this|self)(?:\.|->)([A-Za-z_]\w*)((?:(?:\.|->)[A-Za-z_]\w*\(\)){2,})/g;

export function transitiveNavigation(source, lang) {
  const searchable = strip(source, lang).code;
  const starts = lineIndex(searchable);
  const functions = findFunctions(searchable, lang, starts);
  const seen = new Set();
  return functions.flatMap((fn) => {
    const body = searchable.slice(fn.start, fn.end + 1);
    return [...body.matchAll(CHAIN)].flatMap((match) => {
      const hops = [...match[2].matchAll(/(?:\.|->)([A-Za-z_]\w*)\(\)/g)].map(
        (hop) => hop[1],
      );
      const fact = {
        method: fn.name,
        root: match[1],
        hops,
        chain: match[0],
        line: lineAt(starts, fn.start + match.index),
      };
      const identity = JSON.stringify(fact);
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [fact];
    });
  });
}
