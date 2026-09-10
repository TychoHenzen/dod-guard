function bracketState(ch) {
  if (ch === "[") return true;
  if (ch === "]") return false;
  return null;
}

function slashEnd(ch, inClass, index) {
  return ch === "/" && !inClass ? index + 1 : null;
}

function regexStep(src, i, inClass) {
  const ch = src[i];
  if (ch === "\\") return { next: i + 2, inClass };
  if (ch === "\n") return { end: null };
  const brackets = bracketState(ch);
  if (brackets !== null) return { next: i + 1, inClass: brackets };
  const end = slashEnd(ch, inClass, i);
  if (end !== null) return { end };
  return { next: i + 1, inClass };
}

function readFlags(src, end) {
  let next = end;
  while (next < src.length && /[a-z]/.test(src[next])) next += 1;
  return next;
}

export function readRegex(src, start) {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const step = regexStep(src, i, inClass);
    if (step.end !== undefined) {
      if (step.end === null) return null;
      return readFlags(src, step.end);
    }
    i = step.next;
    inClass = step.inClass;
  }
  return null;
}
