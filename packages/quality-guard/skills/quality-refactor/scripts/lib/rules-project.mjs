import { existsSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { LANG_BY_EXT } from "./config.mjs";
import { readText } from "./walk.mjs";
import { strip } from "./strip.mjs";
import { push } from "./violations.mjs";
import { checkDuplication } from "./rules-duplicate.mjs";
import { checkEnvironment, resolveEntrypoints } from "./rules-project/environment.mjs";
import { checkReachability } from "./rules-reachability.mjs";

const SEE_TAG = /^@see\s+([^\s#]+)(?:#([A-Za-z_$][\w$]*))?\s*$/i;
const CONFIG_TAG = /^@config\s+([^\s:]+):([A-Za-z_][\w.-]*)\s*$/i;
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

function targetFor(root, target) {
  const candidate = resolve(root, target.replaceAll("\\", "/"));
  const fromRoot = relative(root, candidate);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)) return { kind: "missing" };
  if (!existsSync(candidate)) return { kind: "missing" };
  try {
    const rootPath = realpathSync(root);
    const realPath = realpathSync(candidate);
    const realRelative = relative(rootPath, realPath);
    if (realRelative === ".." || realRelative.startsWith("../") || isAbsolute(realRelative)) return { kind: "unavailable" };
    if (!statSync(realPath).isFile() || statSync(realPath).size > MAX_REFERENCE_BYTES) return { kind: "unavailable" };
    return { kind: "file", path: realPath };
  } catch {
    return { kind: "unavailable" };
  }
}

function loadTarget(root, target, cache) {
  if (cache.targets.has(target)) return cache.targets.get(target);
  const resolved = targetFor(root, target);
  if (resolved.kind !== "file") {
    cache.targets.set(target, resolved);
    return resolved;
  }
  const source = readText(resolved.path);
  const loaded = source === null ? { kind: "unavailable" } : { kind: "file", path: resolved.path, source };
  cache.targets.set(target, loaded);
  return loaded;
}

function missingSee(root, target, symbol, files, cache) {
  if (URL.test(target)) return false;
  const key = `see:${target}#${symbol ?? ""}`;
  if (cache.results.has(key)) return cache.results.get(key);
  const loaded = loadTarget(root, target, cache);
  if (loaded.kind === "missing") return cache.results.set(key, true).get(key);
  if (loaded.kind === "unavailable") return cache.results.set(key, null).get(key);
  if (!symbol) return false;
  const targetFile = files.find((item) => resolve(item.path) === loaded.path);
  const lang = targetFile?.lang ?? LANG_BY_EXT[extname(loaded.path).toLowerCase()];
  const code = lang ? strip(loaded.source, lang).code : loaded.source;
  const result = !symbolPattern(symbol).test(code);
  cache.results.set(key, result);
  return result;
}

function hasKey(value, key) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  return Object.entries(value).some(
    ([name, child]) => name === key || hasKey(child, key),
  );
}

function configKeyPresent(source, key) {
  try {
    return hasKey(JSON.parse(source), key);
  } catch {
    return new RegExp(
      `^\\s*["']?${escaped(key)}["']?\\s*(?:[:=]|$)`,
      "m",
    ).test(source);
  }
}

function missingConfig(root, target, key, cache) {
  const resultKey = `config:${target}:${key}`;
  if (cache.results.has(resultKey)) return cache.results.get(resultKey);
  const loaded = loadTarget(root, target, cache);
  if (loaded.kind === "missing") return cache.results.set(resultKey, true).get(resultKey);
  if (loaded.kind === "unavailable") return cache.results.set(resultKey, null).get(resultKey);
  if (/\.json$/i.test(loaded.path)) {
    try {
      const result = !hasKey(JSON.parse(loaded.source), key);
      cache.results.set(resultKey, result);
      return result;
    } catch {
      cache.results.set(resultKey, null);
      return null;
    }
  }
  const result = !configKeyPresent(loaded.source, key);
  cache.results.set(resultKey, result);
  return result;
}

function commentFinding(file, config, line, message) {
  return {
    file,
    line,
    rule: "comment-missing-reference",
    severity: config.presence["comment-missing-reference"],
    message,
    metric: 1,
  };
}

function commentBodies(comment) {
  return comment.text.split(/\r?\n/).map((line, offset) => ({
    body: line.replace(/^[\s/*#]+|[\s*/]+$/g, "").trim(),
    line: comment.line + offset,
  }));
}

function checkCommentReferences({ root, files, scans, config }) {
  const violations = [];
  const cache = { targets: new Map(), results: new Map() };
  for (const file of files) {
    for (const comment of scans.get(file.rel)?.comments ?? []) {
      for (const item of commentBodies(comment)) {
        const see = SEE_TAG.exec(item.body);
        if (see && missingSee(root, see[1], see[2], files, cache)) {
          push({
            out: violations,
            ...commentFinding(
              file,
              config,
              item.line,
              `comment references missing repository target: ${see[1]}`,
            ),
          });
          continue;
        }
        const configTag = CONFIG_TAG.exec(item.body);
        if (configTag && missingConfig(root, configTag[1], configTag[2], cache)) {
          push({
            out: violations,
            ...commentFinding(
              file,
              config,
              item.line,
              `comment references missing configuration key: ${configTag[2]}`,
            ),
          });
        }
      }
    }
  }
  return violations;
}

export {
  checkCommentReferences,
  checkDuplication,
  checkEnvironment,
  checkReachability,
  resolveEntrypoints,
};
