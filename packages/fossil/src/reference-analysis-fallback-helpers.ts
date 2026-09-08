import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";

export function hasFallbackToken(text: string): boolean {
  return /\b(?:fallback|legacy|old|default)\b/i.test(text);
}

export function balancedClose({ code, open, opening, closing }: {
  code: string;
  open: number;
  opening: string;
  closing: string;
}): number | undefined {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === opening) depth += 1;
    if (code[index] === closing && --depth === 0) return index;
  }
  return undefined;
}

export function nextNonWhitespace(code: string, start: number): number {
  let index = start;
  while (/\s/.test(code[index] ?? "")) index += 1;
  return index;
}

export function hasLeadingFallbackComment(view: SyntaxView, position: number): boolean {
  return view.comments.some(
    (comment) =>
      comment.end <= position && /^\s*$/.test(view.code.slice(comment.end, position)) && hasFallbackToken(comment.text),
  );
}
