type SentenceDetail = { count: number; text: string };

export function normalizePlaintext(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[[0-9]+(?:\s*[,;-]\s*[0-9]+)*\]/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/gmu, "")
    .replace(/\b[A-Za-z][A-Za-z0-9]*[_$][A-Za-z0-9_$]*\b/gu, " ")
    .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*(?:[./][A-Za-z0-9_$-]+)+\b/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function wordsIn(text: string): string[] {
  return text.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [];
}

function sentenceDetails(text: string): SentenceDetail[] {
  return text
    .split(/[.!?]+|(?:\r?\n){2,}/u)
    .map((sentence) => ({
      count: wordsIn(sentence).length,
      text: sentence.trim(),
    }))
    .filter((sentence) => sentence.count > 0);
}

export function longestSentence(text: string): SentenceDetail {
  return sentenceDetails(text).reduce(
    (current, sentence) =>
      sentence.count > current.count ? sentence : current,
    { count: 0, text: "" },
  );
}

export function hasUnsupportedScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.some((letter) => !/\p{Script=Latin}/u.test(letter));
}

export function contextFor(text: string): string {
  const context = text.slice(0, 240);
  return context.length === text.length ? context : `${context}...`;
}
