import { extname } from "node:path";
import { LANG_BY_EXT } from "./config-values.mjs";

const DEFAULT_VISIBILITY = {
  ts: "public",
  go: "public",
  cs: "internal",
  java: "internal",
  rs: "internal",
  py: "internal",
  cpp: "internal",
};
const PUBLIC_PATTERN = /\b(?:public|pub)\b/;
const PRIVATE_PATTERN = /\bprivate\b/;
const PROTECTED_PATTERN = /\bprotected\b/;

export function unique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function languageFor(filePath) {
  return LANG_BY_EXT[extname(filePath).toLowerCase()];
}

export function visibility(prefix, lang, name) {
  if (PUBLIC_PATTERN.test(prefix)) return "public";
  if (PRIVATE_PATTERN.test(prefix)) return "private";
  if (name.startsWith("#")) return "private";
  if (PROTECTED_PATTERN.test(prefix)) return "protected";
  return DEFAULT_VISIBILITY[lang];
}
