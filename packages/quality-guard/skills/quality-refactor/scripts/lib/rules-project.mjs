import { existsSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { lineAt } from "./offsets.mjs";
import { wildcardImportsFor } from "./architecture-imports.mjs";
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

function checkWildcardImports({ files, scans, config }) {
  const out = [];
  for (const file of files) {
    const scan = scans.get(file.rel);
    for (const match of wildcardImportsFor(scan?.code ?? "", file.lang)) {
      push({
        out,
        file,
        line: lineAt(scan.starts, match.offset),
        rule: "wildcard-import",
        severity: config.presence["wildcard-import"],
        message:
          `${match.target} wildcard import obscures its imported API; ` +
          "import explicit names instead",
        metric: 1,
      });
    }
  }
  return out;
}

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
  return fromRoot !== "" && fromRoot !== ".." && !fromRoot.startsWith("../") && !isAbsolute(fromRoot);
}

function checkedFile(root, candidate) {
  try {
    const rootPath = realpathSync(root);
    const realPath = realpathSync(candidate);
    if (!pathInside(rootPath, realPath)) return { kind: "unavailable" };
    const stats = statSync(realPath);
    if (!stats.isFile()) return { kind: "unavailable" };
    if (stats.size > MAX_REFERENCE_BYTES) return { kind: "unavailable" };
    return { kind: "file", path: realPath };
  } catch {
    return { kind: "unavailable" };
  }
}

function targetFor(root, target) {
  const candidate = resolve(root, target.replaceAll("\\", "/"));
  if (!pathInside(root, candidate)) return { kind: "missing" };
  if (!existsSync(candidate)) return { kind: "missing" };
  return checkedFile(root, candidate);
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

function remember(cache, key, value) {
  cache.results.set(key, value);
  return value;
}

function seeResult(loaded, symbol, files) {
  if (loaded.kind === "missing") return true;
  if (loaded.kind === "unavailable") return null;
  if (!symbol) return false;
  const targetFile = files.find((item) => resolve(item.path) === loaded.path);
  const lang = targetFile?.lang ?? LANG_BY_EXT[extname(loaded.path).toLowerCase()];
  const code = lang ? strip(loaded.source, lang).code : loaded.source;
  return !symbolPattern(symbol).test(code);
}

function missingSee(target, symbol, { root, files, cache }) {
  if (URL.test(target)) return false;
  const key = `see:${target}#${symbol ?? ""}`;
  if (cache.results.has(key)) return cache.results.get(key);
  const loaded = loadTarget(root, target, cache);
  return remember(cache, key, seeResult(loaded, symbol, files));
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

function configResult(loaded, key) {
  if (loaded.kind === "missing") return true;
  if (loaded.kind === "unavailable") return null;
  if (/\.json$/i.test(loaded.path)) {
    try {
      return !hasKey(JSON.parse(loaded.source), key);
    } catch {
      return null;
    }
  }
  return !configKeyPresent(loaded.source, key);
}

function missingConfig(target, key, { root, cache }) {
  const resultKey = `config:${target}:${key}`;
  if (cache.results.has(resultKey)) return cache.results.get(resultKey);
  const loaded = loadTarget(root, target, cache);
  return remember(cache, resultKey, configResult(loaded, key));
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
  const context = { root, files, cache };
  for (const file of files) {
    for (const comment of scans.get(file.rel)?.comments ?? []) {
      for (const item of commentBodies(comment)) {
        const see = SEE_TAG.exec(item.body);
        if (see && missingSee(see[1], see[2], context)) {
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
        if (configTag && missingConfig(configTag[1], configTag[2], context)) {
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
  checkWildcardImports,
  resolveEntrypoints,
};
