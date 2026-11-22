import { matchBracket } from "../offsets.mjs";
import { findFunctions } from "../parse.mjs";
import { splitParams } from "../parse-parameters.mjs";
import { strip } from "../strip.mjs";

const CONFIGURATION_WORDS = [
  "config", "settings?", "options?",
  "timeout", "deadline", "retry", "backoff", "delay", "interval",
  "limit", "threshold", "capacity", "size", "batch", "page(?:Size)?",
  "max", "min", "parallel", "concurrency",
  "host", "port", "url", "region", "connection", "pool",
  "path", "directory", "file", "format", "mode", "enabled", "disabled",
  "cache", "buffer",
];
const CONFIGURATION_PARAMETER = new RegExp(
  `(?:${CONFIGURATION_WORDS.join("|")})`,
  "i",
);
const NUMBER = String.raw`[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?[uUlLfFdDmM]*`;
const KEYWORD_LITERAL = "true|false|null|undefined|none|nil";
const NUMBER_OR_KEYWORD = new RegExp(`^(?:${NUMBER}|${KEYWORD_LITERAL})$`, "i");
const QUOTED = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/s;

function parameterText(source, fn) {
  const open = source.indexOf("(", fn.headerStart);
  if (open === -1) return [];
  const close = matchBracket(source, open, "()");
  return close === -1 ? [] : splitParams(source.slice(open + 1, close));
}

function isDefaultAssignment(parameter, index, depth) {
  return [
    parameter[index] === "=",
    depth === 0,
    !/[=!<>]/.test(parameter[index - 1] ?? ""),
    parameter[index + 1] !== ">",
  ].every(Boolean);
}

function defaultOffset(parameter) {
  let depth = 0;
  for (let index = 0; index < parameter.length; index += 1) {
    const character = parameter[index];
    depth += Number("([{<".includes(character));
    depth -= Number(")]}>".includes(character));
    if (isDefaultAssignment(parameter, index, depth))
      return index;
  }
  return -1;
}

function parameterName(left, lang) {
  const cleaned = left.replace(/\b(?:ref|out|in|params|mut)\b/g, "").trim();
  if (lang === "py") return /^\*{0,2}([A-Za-z_]\w*)/.exec(cleaned)?.[1];
  if (lang === "ts")
    return (
      /^\.\.\.?(?:\s*)?([A-Za-z_$][\w$]*)/.exec(cleaned)?.[1] ??
      cleaned
        .split(":", 1)[0]
        .trim()
        .match(/[A-Za-z_$][\w$]*$/)?.[0]
    );
  return cleaned.match(/[A-Za-z_]\w*$/)?.[0];
}

function literalDefault(value) {
  const trimmed = value.trim();
  return NUMBER_OR_KEYWORD.test(trimmed) || QUOTED.test(trimmed)
    ? trimmed
    : undefined;
}

function defaultFact(parameter, fn, lang) {
  const split = defaultOffset(parameter);
  if (split === -1) return [];
  const name = parameterName(parameter.slice(0, split), lang);
  if (!name || !CONFIGURATION_PARAMETER.test(name)) return [];
  const value = literalDefault(parameter.slice(split + 1));
  if (!value) return [];
  return [
    { method: fn.name, parameter: name, defaultValue: value, line: fn.line },
  ];
}

export function configurationDefaults(source, lang) {
  if (lang === "rs") return [];
  const functions = findFunctions(strip(source, lang), lang, source);
  return functions.flatMap((fn) =>
    parameterText(source, fn).flatMap((parameter) =>
      defaultFact(parameter, fn, lang),
    ),
  );
}
