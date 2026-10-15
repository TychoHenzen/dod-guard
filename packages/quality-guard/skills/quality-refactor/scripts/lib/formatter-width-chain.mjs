// Finds the Biome configs that govern a file: the nearest config at or below
// the scan root, plus its ancestor when it extends "//". Nothing above the
// root is read, so the PR gate's base worktree is judged by its own config.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseJsonc } from "./formatter-width-jsonc.mjs";

const CONFIG_NAMES = ["biome.json", "biome.jsonc"];

const joinRel = (dir, name) => (dir === "" ? name : `${dir}/${name}`);

function ancestorDirs(relFile) {
  const dirs = [];
  let dir = relFile;
  do {
    dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
    dirs.push(dir);
  } while (dir !== "");
  return dirs;
}

// A config that exists but cannot be read or parsed is `{ broken: true }`,
// not absent: skipping it would let an ancestor decide a width that Biome
// itself would refuse to apply.
function readConfig(root, dir) {
  const exists = (name) => existsSync(resolve(root, dir, name));
  const name = CONFIG_NAMES.find(exists);
  if (name === undefined) return null;
  try {
    const text = readFileSync(resolve(root, dir, name), "utf8");
    const json = parseJsonc(text);
    if (json === null) return { broken: true };
    return { dir, path: joinRel(dir, name), json };
  } catch {
    return { broken: true };
  }
}

// ASSUMPTION: an `extends: "//"` config whose ancestor is missing, broken,
// or itself extends something cannot be layered the way Biome would, so its
// files fall back. This is the conservative reading of #871 C2.
function extendsChain(nested, ancestor) {
  if (ancestor === null || ancestor.broken) return null;
  if (ancestor.json.extends !== undefined) return null;
  return { configs: [ancestor, nested], anchor: nested.dir, gate: ancestor };
}

// Biome refuses a second root config below another one and formats nothing
// under it; `"root": false` marks a deliberate standalone nested config.
function standaloneChain(config, ancestor) {
  if (ancestor !== null && config.json.root !== false) return null;
  return { configs: [config], anchor: config.dir, gate: null };
}

function chainFrom(found) {
  const [config, ancestor = null] = found;
  if (config === undefined || config.broken) return null;
  const parent = config.json.extends;
  if (parent === undefined) return standaloneChain(config, ancestor);
  return parent === "//" ? extendsChain(config, ancestor) : null;
}

/**
 * Map a root-relative POSIX path to its config chain, or null when no
 * judgeable config governs it. Each finder caches the configs it parsed, so
 * one finder serves exactly one scan.
 */
export function createChainFinder(root) {
  const cache = new Map();
  const read = (dir) => {
    if (!cache.has(dir)) cache.set(dir, readConfig(root, dir));
    return cache.get(dir);
  };
  return (relFile) => {
    const found = ancestorDirs(relFile).map(read).filter(Boolean);
    return chainFrom(found);
  };
}
