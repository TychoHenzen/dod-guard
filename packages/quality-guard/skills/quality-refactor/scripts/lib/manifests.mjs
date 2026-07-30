// Non-code reference evidence: scene files, project files, config and markup.

import { extname } from "node:path";
import { MANIFEST_EXTS } from "./config.mjs";
import { readText, walkDir } from "./walk.mjs";

/**
 * Collect non-code manifest files under `root` as reference evidence for
 * `checkReachability`. A Godot node connects a script through a `.tscn`, and a
 * project file connects a class through a path. Neither is a code reference, so
 * reachability that only reads source calls that script dead.
 *
 * Manifests are never parsed as source, never scanned for violations, and never
 * counted in the scanned file total. Only their text is searched for symbol
 * names. See `MANIFEST_EXTS` in config.mjs for the extensions.
 */
export function collectManifests(root, excludes = []) {
  const out = [];
  walkDir(root, { root, excludes }, (entry, full, rel) => {
    if (!MANIFEST_EXTS.has(extname(entry.name).toLowerCase())) return;
    const text = readText(full);
    if (text !== null) out.push({ rel, text });
  });
  return out;
}
