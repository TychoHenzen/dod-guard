// Finds the line width Biome formats a JS/TS file at, so `line-length`
// judges the file against the formatter's own width instead of a fixed one.

import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { LANG_BY_EXT } from "./config.mjs";
import { createChainFinder } from "./formatter-width-chain.mjs";
import { widthFromChain } from "./formatter-width-layers.mjs";

// The scanner's "ts" family is exactly the set Biome's JS formatter handles.
const JS_EXTENSIONS = new Set(
  Object.keys(LANG_BY_EXT).filter((ext) => LANG_BY_EXT[ext] === "ts"),
);
const FALLBACK = Object.freeze({ width: null, source: "default" });

// Null for a file Biome's JS formatter never sees or one outside the root.
function judgedPath(root, filePath) {
  if (!JS_EXTENSIONS.has(extname(filePath).toLowerCase())) return null;
  const rel = relative(root, resolve(root, filePath)).split(sep).join("/");
  const outside = rel === ".." || rel.startsWith("../") || isAbsolute(rel);
  return outside ? null : rel;
}

function widthOf(root, chainOf, filePath) {
  const relFile = judgedPath(root, filePath);
  if (relFile === null) return FALLBACK;
  const chain = chainOf(relFile);
  if (chain === null) return FALLBACK;
  return widthFromChain(chain, relFile) ?? FALLBACK;
}

/**
 * Build a resolver for one scan. It maps a scanned file's absolute or
 * root-relative path to `{ width, source }`: `source` is the deciding config
 * relative to `root`, or "default" with a null width when Biome does not
 * format the file or its config cannot be judged.
 */
export function createWidthResolver(root) {
  const chainOf = createChainFinder(root);
  return (filePath) => widthOf(root, chainOf, filePath);
}
