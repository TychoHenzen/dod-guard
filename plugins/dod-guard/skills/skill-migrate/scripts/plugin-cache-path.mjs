// Decide whether a path points into an installed plugin cache. A fix made there
// is overwritten by the next /plugin update, so skill-migrate refuses such a target.
import { realpathSync } from "node:fs";

const CACHE_SEGMENT = "/.claude/plugins/";

// Backslashes read as separators and the compare ignores case, so a Windows path
// and a path on a case-insensitive disk are caught too. A clone kept under
// ~/.claude/plugins/marketplaces/ matches on purpose: it is install output as well.
export function isPluginCachePath(path) {
  const normalized = `/${path.replace(/\\/g, "/").toLowerCase()}/`;
  return normalized.includes(CACHE_SEGMENT);
}

// Returns the offending path (raw or resolved) or null. A path that does not
// resolve is judged on its raw text alone; the caller reports the unreadable file.
export function findPluginCachePath(path, resolveReal = realpathSync) {
  if (isPluginCachePath(path)) return path;
  let real;
  try {
    real = resolveReal(path);
  } catch {
    return null;
  }
  return isPluginCachePath(real) ? real : null;
}
