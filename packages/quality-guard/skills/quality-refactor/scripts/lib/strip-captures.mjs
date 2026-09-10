function countNewlines(text) {
  let count = 0;
  for (const ch of text) if (ch === "\n") count += 1;
  return count;
}

function identifiersInCapture(content) {
  const colonAt = content.indexOf(":");
  const questionAt = content.indexOf("?");
  const cut = Math.min(
    ...[content.length, colonAt, questionAt].filter((index) => index !== -1),
  );
  return [...content.slice(0, cut).matchAll(/[A-Za-z_]\w*/g)].map((match) => ({
    name: match[0],
    offset: match.index,
  }));
}

function isCaptureDelimiter(run, mode) {
  return mode.escaped ? run === mode.braceCount : run >= mode.braceCount;
}

function findCaptureClose(text, from, mode) {
  let j = from;
  while (j < text.length) {
    if (text[j] !== "}") {
      j += 1;
      continue;
    }
    let run = 0;
    while (text[j + run] === "}") run += 1;
    if (isCaptureDelimiter(run, mode)) return j;
    j += run;
  }
  return -1;
}

function readCapture(ctx, cursor, span) {
  const { text, mode } = ctx;
  const { start, captureStart, close } = span;
  const content = text.slice(captureStart, close);
  const openLine = cursor.line + countNewlines(text.slice(start, captureStart));
  const ids = identifiersInCapture(content).map(({ name, offset }) => ({
    name,
    line: openLine + countNewlines(content.slice(0, offset)),
  }));
  cursor.line += countNewlines(text.slice(start, close + mode.braceCount));
  cursor.index = close + mode.braceCount;
  return ids;
}

function openCapture(ctx, cursor) {
  const { text, mode } = ctx;
  const start = cursor.index;
  let run = 0;
  while (text[start + run] === "{") run += 1;
  if (!isCaptureDelimiter(run, mode)) {
    cursor.index += run;
    return [];
  }
  const captureStart = start + mode.braceCount;
  const close = findCaptureClose(text, captureStart, mode);
  if (close === -1) {
    cursor.index += run;
    return [];
  }
  return readCapture(ctx, cursor, { start, captureStart, close });
}

function captureStep(ctx, cursor) {
  const ch = ctx.text[cursor.index];
  if (ch === "\n") {
    cursor.line += 1;
    cursor.index += 1;
    return [];
  }
  if (ch !== "{") {
    cursor.index += 1;
    return [];
  }
  return openCapture(ctx, cursor);
}

export function extractCaptures(text, startLine, mode) {
  const found = [];
  const ctx = { text, mode };
  const cursor = { index: 0, line: startLine };
  while (cursor.index < text.length) found.push(...captureStep(ctx, cursor));
  return found;
}
