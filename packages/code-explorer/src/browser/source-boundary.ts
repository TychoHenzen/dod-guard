function isValidOffset(body: string, offset: number): boolean {
  return Number.isInteger(offset) && offset >= 0 && offset <= body.length;
}

function isSurrogatePair(body: string, offset: number): boolean {
  const before = body.charCodeAt(offset - 1);
  const after = body.charCodeAt(offset);
  return (
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
  );
}

export function validBoundary(body: string, offset: number): boolean {
  if (!isValidOffset(body, offset)) return false;
  if (offset === 0 || offset === body.length) return true;
  return !isSurrogatePair(body, offset);
}
