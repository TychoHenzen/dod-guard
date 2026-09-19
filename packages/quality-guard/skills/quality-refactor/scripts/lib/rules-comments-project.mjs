import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { readText } from "./walk.mjs";
import { push } from "./violations.mjs";

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
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(".." + "/") || isAbsolute(fromRoot)) return null;
  return candidate;
}

function missingSee(root, target, symbol) {
  if (URL.test(target)) return false;
  const file = pathInside(root, target);
  if (file === null || !existsSync(file)) return true;
  if (!symbol) return false;
  const source = readText(file);
  return source === null || !symbolPattern(symbol).test(source);
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
  if (file === null) return true;
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

function finding(file, config, line, message) {
  return {
    file,
    line,
    rule: "comment-missing-reference",
    severity: config.presence["comment-missing-reference"],
    message,
    metric: 1,
  };
}

export function checkCommentReferences({ root, files, scans, config }) {
  const violations = [];
  for (const file of files) {
    for (const comment of scans.get(file.rel)?.comments ?? []) {
      const lines = comment.text.split(/\r?\n/);
      for (const [offset, line] of lines.entries()) {
        const body = line.replace(/^[\s/*#]+|[\s*/]+$/g, "").trim();
        const lineNumber = comment.line + offset;
        const see = SEE_TAG.exec(body);
        if (see && missingSee(root, see[1], see[2])) {
          push({
            out: violations,
            ...finding(
              file,
              config,
              lineNumber,
              `comment references missing repository target: ${see[1]}`,
            ),
          });
          continue;
        }
        const configTag = CONFIG_TAG.exec(body);
        if (configTag && missingConfig(root, configTag[1], configTag[2])) {
          push({
            out: violations,
            ...finding(
              file,
              config,
              lineNumber,
              `comment references missing configuration key: ${configTag[2]}`,
            ),
          });
        }
      }
    }
  }
  return violations;
}
