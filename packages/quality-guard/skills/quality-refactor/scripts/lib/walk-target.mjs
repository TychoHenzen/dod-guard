import { statSync } from "node:fs";
import { extname, relative } from "node:path";
import { LANG_BY_EXT } from "./config.mjs";

export function collectTarget({ target, root, excludes, take, out, walk }) {
  let info;
  try {
    info = statSync(target);
  } catch {
    return;
  }
  if (info.isDirectory()) {
    walk(target, { root, excludes }, take);
    return;
  }
  const lang = LANG_BY_EXT[extname(target).toLowerCase()];
  if (lang) {
    out.push({
      path: target,
      rel: relative(root, target).split("\\").join("/"),
      lang,
    });
  }
}
