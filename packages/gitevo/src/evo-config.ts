/**
 * Settings for the safety evaluation, read from <top level>/.evo/config.json.
 *
 * The file is optional. Whatever it names wins over the default of the same
 * key, and a file that will not parse is ignored entirely.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface EvoConfig {
  sourceExtensions: string[];
  buildLayouts: string[];
  skipStaleCheck: boolean;
}

/** A fresh copy every call, so a caller cannot edit the defaults by accident. */
function defaults(): EvoConfig {
  return {
    sourceExtensions: [".ts", ".js", ".mjs", ".json", ".md", ".yml", ".yaml"],
    buildLayouts: ["packages/*/dist/", "dist/"],
    skipStaleCheck: false,
  };
}

/** Read the settings that apply to the repository at `cwd`. */
export function loadConfig(cwd: string): EvoConfig {
  const file = path.join(cwd, ".evo", "config.json");
  if (!fs.existsSync(file)) return defaults();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<EvoConfig> | null;
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}
