import { proseLines } from "./text.mjs";

const SNIPPET_LENGTH = 60;

export const snippet = (text) => text.trim().slice(0, SNIPPET_LENGTH);

export function scanPatterns(body, patterns) {
  return proseLines(body).flatMap(({ text, line }) =>
    patterns.filter(({ pattern }) => pattern.test(text)).map(({ name }) => ({ name, line, text: snippet(text) })),
  );
}

export function lineHits(body, matches) {
  return proseLines(body)
    .filter(({ text }) => matches(text))
    .map(({ text, line }) => ({ line, text: snippet(text) }));
}

export const atLine = (hit) => `L${hit.line}`;
export const atLineNamed = (hit) => `L${hit.line}: ${hit.name}`;

export function hitsDetail(hits, { none, describe, separator = "; " }) {
  return hits.length === 0 ? none : hits.map(describe).join(separator);
}

export function hitsResult({ id, label, hits, ...format }) {
  const detail = hitsDetail(hits, format);
  return { id, label, value: hits.length, pass: hits.length === 0, detail, hits };
}
