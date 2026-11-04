// Finds the line width Biome formats a JS/TS file at, so `line-length`
// judges the file against the formatter's own width instead of a fixed one.

import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { LANG_BY_EXT } from "./config.mjs";
import { createChainFinder } from "./formatter-width-chain.mjs";
import { widthFromChain } from "./formatter-width-layers.mjs";
import { createEditorconfigResolver } from "./editorconfig-width.mjs";

// The scanner's "ts" family is exactly the set Biome's JS formatter handles.
const JS_EXTENSIONS = new Set(
  Object.keys(LANG_BY_EXT).filter((ext) => LANG_BY_EXT[ext] === "ts"),
);
const FALLBACK = Object.freeze({ width: null, source: "default" });

// Root-relative POSIX path of a file, or null when it lies outside the root.
function rootRelative(root, filePath) {
  const rel = relative(root, resolve(root, filePath)).split(sep).join("/");
  const outside = rel === ".." || rel.startsWith("../") || isAbsolute(rel);
  return outside ? null : rel;
}

// Null for a file Biome's JS formatter never sees or one outside the root.
function judgedPath(root, filePath) {
  if (!JS_EXTENSIONS.has(extname(filePath).toLowerCase())) return null;
  return rootRelative(root, filePath);
}

// Biome decides for the JS family it formats. Every other file, and a JS file
// Biome does not format, falls through to the .editorconfig width.
function widthOf(root, chainOf, editorconfig, filePath) {
  const relFile = judgedPath(root, filePath);
  const chain = relFile === null ? null : chainOf(relFile);
  const biome = chain === null ? null : widthFromChain(chain, relFile);
  if (biome !== null) return biome;
  const rel = rootRelative(root, filePath);
  const fromEditorconfig = rel === null ? null : editorconfig(rel);
  return fromEditorconfig ?? FALLBACK;
}

/**
 * Build a resolver for one scan. It maps a scanned file's absolute or
 * root-relative path to `{ width, source }`: `source` is the deciding config
 * relative to `root` (a Biome config for JS files, otherwise an .editorconfig),
 * or "default" with a null width when neither governs the file.
 */
export function createWidthResolver(root) {
  const chainOf = createChainFinder(root);
  const editorconfig = createEditorconfigResolver(root);
  return (filePath) => widthOf(root, chainOf, editorconfig, filePath);
}
