import { lineIndex, matchBracket } from "../offsets.mjs";
import { findFunctions } from "../parse.mjs";
import { splitParams } from "../parse-parameters.mjs";
import { strip } from "../strip.mjs";

const CONFIGURATION_PARAMETER =
  /(?:config|settings?|options?|timeout|deadline|retry|backoff|limit|threshold|capacity|size|batch|page(?:Size)?|host|port|url|path|directory|file|format|mode|enabled|disabled|region|connection|pool|cache|buffer|delay|interval|parallel|concurrency|max|min)/i;

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
  const numberOrBoolean =
    /^(?:[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?[uUlLfFdDmM]*|true|false|null|undefined|none|nil)$/i;
  const quoted = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/s;
  return numberOrBoolean.test(trimmed) || quoted.test(trimmed)
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
  return [{ method: fn.name, parameter: name, defaultValue: value, line: fn.line }];
}

export function configurationDefaults(source, lang) {
  if (lang === "rs") return [];
  const searchable = strip(source, lang).code;
  const functions = findFunctions(searchable, lang, lineIndex(searchable));
  return functions.flatMap((fn) =>
    parameterText(source, fn).flatMap((parameter) =>
      defaultFact(parameter, fn, lang),
    ),
  );
}
