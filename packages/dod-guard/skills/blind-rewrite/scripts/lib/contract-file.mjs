// Parses a --contract-file for the overlap gate and assembles scoreOverlap
// options from parsed CLI args. A contract string is text a contract requires
// byte for byte, which is therefore not evidence of copying.
//
// Two formats. A JSON array of strings carries entries that span several
// lines, such as a required boilerplate block. Anything else is read as one
// contract string per line, where blank lines and lines starting with # are
// skipped.

import { readFileSync } from "node:fs";

function isContractLine(line) {
  return line.length > 0 && !line.startsWith("#");
}

function parseContractLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isContractLine);
}

/** A JSON array of strings, or null when the text is not one. */
function parseContractJson(text) {
  if (!text.trimStart().startsWith("[")) {
    return null;
  }
  const parsed = JSON.parse(text);
  const isString = (entry) => typeof entry === "string";
  if (!Array.isArray(parsed) || !parsed.every(isString)) {
    throw new Error("contract file JSON must be an array of strings");
  }
  return parsed.filter((entry) => entry.length > 0);
}

export function loadContracts(path) {
  if (!path) {
    return [];
  }
  const text = readFileSync(path, "utf8");
  return parseContractJson(text) ?? parseContractLines(text);
}

export function resolveOptions(args) {
  const whitelist = (args.whitelist ?? "").split(",").filter(Boolean);
  const options = { whitelist: whitelist.map((name) => name.trim()) };
  if (args["ngram-size"]) {
    options.ngramSize = Number(args["ngram-size"]);
  }
  options.contracts = loadContracts(args["contract-file"]);
  return options;
}
