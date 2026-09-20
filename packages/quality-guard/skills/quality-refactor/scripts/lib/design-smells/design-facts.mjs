import { lineAt, lineIndex, matchBracket } from "../offsets.mjs";
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

function defaultOffset(parameter) {
  let depth = 0;
  for (let index = 0; index < parameter.length; index += 1) {
    const character = parameter[index];
    if ("([{<".includes(character)) depth += 1;
    else if (")]}>".includes(character)) depth -= 1;
    else if (
      character === "=" &&
      depth === 0 &&
      parameter[index - 1] !== "=" &&
      parameter[index - 1] !== "!" &&
      parameter[index - 1] !== "<" &&
      parameter[index - 1] !== ">" &&
      parameter[index + 1] !== ">"
    ) {
      return index;
    }
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
  return /^(?:[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?[uUlLfFdDmM]*|true|false|null|undefined|none|nil)$/i.test(
    trimmed,
  ) || /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/s.test(trimmed)
    ? trimmed
    : undefined;
}

export function configurationDefaults(source, lang) {
  if (lang === "rs") return [];
  const searchable = strip(source, lang).code;
  const functions = findFunctions(searchable, lang, lineIndex(searchable));
  return functions.flatMap((fn) =>
    parameterText(source, fn).flatMap((parameter) => {
      const split = defaultOffset(parameter);
      if (split === -1) return [];
      const name = parameterName(parameter.slice(0, split), lang);
      const value = literalDefault(parameter.slice(split + 1));
      return name && value && CONFIGURATION_PARAMETER.test(name)
        ? [
            {
              method: fn.name,
              parameter: name,
              defaultValue: value,
              line: fn.line,
            },
          ]
        : [];
    }),
  );
}

export function transitiveNavigation(source, lang) {
  const searchable = strip(source, lang).code;
  const starts = lineIndex(searchable);
  const functions = findFunctions(searchable, lang, starts);
  const chainPattern =
    /\b(?:this|self)(?:\.|->)([A-Za-z_]\w*)((?:(?:\.|->)[A-Za-z_]\w*\(\)){2,})/g;
  const seen = new Set();
  return functions.flatMap((fn) => {
    const body = searchable.slice(fn.start, fn.end + 1);
    return [...body.matchAll(chainPattern)].flatMap((match) => {
      const hops = [...match[2].matchAll(/(?:\.|->)([A-Za-z_]\w*)\(\)/g)].map(
        (hop) => hop[1],
      );
      const fact = {
        method: fn.name,
        root: match[1],
        hops,
        chain: match[0],
        line: lineAt(starts, fn.start + match.index),
      };
      const identity = JSON.stringify(fact);
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [fact];
    });
  });
}

export function designFacts(source, lang) {
  return {
    configurationDefaults: configurationDefaults(source, lang),
    transitiveNavigation: transitiveNavigation(source, lang),
  };
}
