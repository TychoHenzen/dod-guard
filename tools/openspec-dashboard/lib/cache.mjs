// cache.mjs - reuse a CLI result until the project's own files change.
//
// One CLI run costs about 860ms on this machine, nearly all of it node
// startup, so the cost is per run rather than per project size. An openspec
// tree is a few dozen small files, so stat-walking it is far cheaper than
// re-running a command that would return the same answer.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

async function mtimeOf(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

/** Newest modification time anywhere under dir, or 0 when it cannot be read. */
export async function newestMtime(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let newest = await mtimeOf(dir);
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const time = entry.isDirectory() ? await newestMtime(path) : await mtimeOf(path);
    if (time > newest) newest = time;
  }
  return newest;
}

export function createCache() {
  const entries = new Map();
  return {
    async get(projectPath, key, stamp, produce) {
      const id = `${projectPath}::${key}`;
      const hit = entries.get(id);
      if (hit && hit.stamp === stamp) return hit.value;
      const value = await produce();
      entries.set(id, { stamp, value });
      return value;
    },
    clear(projectPath) {
      for (const id of [...entries.keys()]) {
        if (id.startsWith(`${projectPath}::`)) entries.delete(id);
      }
    },
  };
}
