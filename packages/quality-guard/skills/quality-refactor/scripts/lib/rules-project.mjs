import { existsSync } from "node:fs";
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

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function symbolPattern(symbol) {
  return new RegExp(
    `(?:^|[^A-Za-z0-9_$])${escaped(symbol)}(?=$|[^A-Za-z0-9_$])`,
  );
}

function pathInside(root, target) {
  const candidate = resolve(root, target.replaceAll("\\", "/"));
  const fromRoot = relative(root, candidate);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)) return null;
  return candidate;
}

function missingSee(root, target, symbol, files) {
  if (URL.test(target)) return false;
  const file = pathInside(root, target);
  if (file === null || !existsSync(file)) return true;
  if (!symbol) return false;
  const source = readText(file);
  if (source === null) return null;
  const targetFile = files.find((item) => resolve(item.path) === file);
  const lang = targetFile?.lang ?? LANG_BY_EXT[extname(file).toLowerCase()];
  const code = lang ? strip(source, lang).code : source;
  return !symbolPattern(symbol).test(code);
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

function missingConfig(root, target, key) {
  const file = pathInside(root, target);
  if (file === null || !existsSync(file)) return true;
  const source = readText(file);
  if (source === null) return null;
  if (/\.json$/i.test(file)) {
    try {
      return !hasKey(JSON.parse(source), key);
    } catch {
      return null;
    }
  }
  return !configKeyPresent(source, key);
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
  for (const file of files) {
    for (const comment of scans.get(file.rel)?.comments ?? []) {
      for (const item of commentBodies(comment)) {
        const see = SEE_TAG.exec(item.body);
        if (see && missingSee(root, see[1], see[2], files)) {
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
        if (configTag && missingConfig(root, configTag[1], configTag[2])) {
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
