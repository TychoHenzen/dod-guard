import { existsSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { LANG_BY_EXT } from "../config.mjs";
import { readText } from "../walk.mjs";
import { strip } from "../strip.mjs";

const URL = /^https?:\/\//i;
const MAX_REFERENCE_BYTES = 1024 * 1024;

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function symbolPattern(symbol) {
  return new RegExp(
    `(?:^|[^A-Za-z0-9_$])${escaped(symbol)}(?=$|[^A-Za-z0-9_$])`,
  );
}

function pathInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith("../") &&
    !isAbsolute(fromRoot)
  );
}

function checkedFile(root, candidate) {
  try {
    const rootPath = realpathSync(root);
    const realPath = realpathSync(candidate);
    if (!pathInside(rootPath, realPath)) return { kind: "unavailable" };
    const stats = statSync(realPath);
    if (!stats.isFile() || stats.size > MAX_REFERENCE_BYTES)
      return { kind: "unavailable" };
    return { kind: "file", path: realPath };
  } catch {
    return { kind: "unavailable" };
  }
}

function targetFor(root, target) {
  const candidate = resolve(root, target.replaceAll("\\", "/"));
  if (!pathInside(root, candidate) || !existsSync(candidate))
    return { kind: "missing" };
  return checkedFile(root, candidate);
}

export function loadTarget(root, target, cache) {
  if (cache.targets.has(target)) return cache.targets.get(target);
  const resolved = targetFor(root, target);
  if (resolved.kind !== "file") {
    cache.targets.set(target, resolved);
    return resolved;
  }
  const source = readText(resolved.path);
  const loaded = source === null
    ? { kind: "unavailable" }
    : { kind: "file", path: resolved.path, source };
  cache.targets.set(target, loaded);
  return loaded;
}

function languageFor(loaded, files) {
  const targetFile = files.find((item) => resolve(item.path) === loaded.path);
  if (targetFile) return targetFile.lang;
  return LANG_BY_EXT[extname(loaded.path).toLowerCase()];
}

function seeResult(loaded, symbol, files) {
  if (loaded.kind === "missing") return true;
  if (loaded.kind === "unavailable" || !symbol) return false;
  const lang = languageFor(loaded, files);
  const code = lang ? strip(loaded.source, lang).code : loaded.source;
  return !symbolPattern(symbol).test(code);
}

function remember(cache, key, value) {
  cache.results.set(key, value);
  return value;
}

export function missingSee({ target, symbol, root, files, cache }) {
  if (URL.test(target)) return false;
  const key = `see:${target}#${symbol ?? ""}`;
  if (cache.results.has(key)) return cache.results.get(key);
  return remember(
    cache,
    key,
    seeResult(loadTarget(root, target, cache), symbol, files),
  );
}
