// Whether a Biome config chain covers a file at all: the include lists, and
// whether the configs hold anything the resolver cannot judge. The anchoring
// below was observed with Biome 2.5.3 in temp-dir probes.

import { isUnsupportedGlob, listIncludes } from "./formatter-width-glob.mjs";

const MAX_WIDTH = 320;

const isObject = (value) => value !== null && typeof value === "object";
export const formatterOf = (settings) => settings.formatter ?? {};
export const jsFormatterOf = (settings) =>
  settings.javascript?.formatter ?? {};
const filesOf = (config) => config.json.files?.includes;
const formatterIncludes = (config) => formatterOf(config.json).includes;

export function overridesOf(config) {
  const { overrides } = config.json;
  return Array.isArray(overrides) ? overrides.filter(isObject) : [];
}

export function relativeTo(dir, relFile) {
  return dir === "" ? relFile : relFile.slice(dir.length + 1);
}

function includeLists(config) {
  const own = [filesOf(config), formatterIncludes(config)];
  return [...own, ...overridesOf(config).map((entry) => entry.includes)];
}

function hasUnsupportedList(list) {
  if (list === undefined) return false;
  return !Array.isArray(list) || list.some(isUnsupportedGlob);
}

function widthValues(config) {
  const sections = [config.json, ...overridesOf(config)];
  return sections.flatMap((section) => [
    formatterOf(section).lineWidth,
    jsFormatterOf(section).lineWidth,
  ]);
}

function isValidWidth(width) {
  if (width === undefined) return true;
  return Number.isInteger(width) && width >= 1 && width <= MAX_WIDTH;
}

// Biome rejects a whole config over one bad width or glob, so one of them
// anywhere makes the scanner fall back rather than trust the rest.
function isJudgeable(configs) {
  const lists = configs.flatMap(includeLists);
  if (lists.some(hasUnsupportedList)) return false;
  return configs.flatMap(widthValues).every(isValidWidth);
}

// Include lists concatenate across an `extends` chain, ancestor first.
function mergedList(configs, read) {
  const lists = configs.map(read).filter((list) => list !== undefined);
  return lists.length === 0 ? undefined : lists.flat();
}

// The ancestor's own files.includes also gates the file from its own
// directory, the way Biome's crawl skips an excluded subtree.
function gateAllows(gate, relFile) {
  if (gate === null) return true;
  return listIncludes(filesOf(gate), relativeTo(gate.dir, relFile));
}

/** True when Biome would format `relFile` under `chain` (ancestor first). */
export function chainCovers(chain, relFile) {
  const { configs, anchor, gate } = chain;
  const fromAnchor = relativeTo(anchor, relFile);
  if (!isJudgeable(configs) || !gateAllows(gate, relFile)) return false;
  if (!listIncludes(mergedList(configs, filesOf), fromAnchor)) return false;
  return listIncludes(mergedList(configs, formatterIncludes), fromAnchor);
}
