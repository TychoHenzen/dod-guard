export function testRange(
  start: { line: number; character: number },
  end: { line: number; character: number },
) {
  return { start, end };
}

export function testLocation(
  path: string,
  start: { line: number; character: number },
  end: { line: number; character: number },
) {
  return { path, range: testRange(start, end) };
}
