// Turns the Biome configs that govern one file into the width Biome formats
// it at. The layer order was observed with Biome 2.5.3 in temp-dir probes.

import { listIncludes } from "./formatter-width-glob.mjs";
import {
  chainCovers,
  formatterOf,
  jsFormatterOf,
  overridesOf,
  relativeTo,
} from "./formatter-width-scope.mjs";

const BIOME_DEFAULT_WIDTH = 80;

// Bases first, then every config's matching overrides, so an ancestor
// override beats the nested config's base settings.
function layersFor({ configs, anchor }, relFile) {
  const fromAnchor = relativeTo(anchor, relFile);
  const bases = configs.map((config) => ({
    settings: config.json,
    source: config.path,
  }));
  const overrides = configs.flatMap((config) =>
    overridesOf(config)
      .filter((entry) => listIncludes(entry.includes, fromAnchor))
      .map((entry) => ({ settings: entry, source: config.path })),
  );
  return [...bases, ...overrides];
}

function lastSetting(layers, read) {
  let found;
  for (const layer of layers) {
    const value = read(layer.settings);
    if (value !== undefined) found = { value, source: layer.source };
  }
  return found;
}

// ASSUMPTION: "enabled false in the winning layer" (#871 C2) is read as the
// last layer that sets `enabled`, layered like the width, because Biome
// merges every setting that way; it was not probed against Biome.
function isDisabled(layers) {
  const general = lastSetting(layers, (s) => formatterOf(s).enabled);
  const javascript = lastSetting(layers, (s) => jsFormatterOf(s).enabled);
  return general?.value === false || javascript?.value === false;
}

const layerWidth = (settings) =>
  jsFormatterOf(settings).lineWidth ?? formatterOf(settings).lineWidth;

/**
 * Width for one file under a resolved config chain (ancestor first), or null
 * when Biome would not format the file or the configs cannot be judged.
 */
export function widthFromChain(chain, relFile) {
  if (!chainCovers(chain, relFile)) return null;
  const layers = layersFor(chain, relFile);
  if (isDisabled(layers)) return null;
  const width = lastSetting(layers, layerWidth);
  if (width) return { width: width.value, source: width.source };
  const nearest = chain.configs.at(-1);
  return { width: BIOME_DEFAULT_WIDTH, source: nearest.path };
}
