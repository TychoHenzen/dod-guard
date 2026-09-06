export const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
export const LF_LF = new Uint8Array([10, 10]);

export function encodeMessage(message: Record<string, unknown>): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  return concat(
    new TextEncoder().encode(`Content-Length: ${body.byteLength}\r\n\r\n`),
    body,
  );
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}

export function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  for (let index = 0; index <= haystack.length - needle.length; index++) {
    if (needle.every((value, offset) => haystack[index + offset] === value))
      return index;
  }
  return -1;
}

export function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  return indexOf(haystack, needle) >= 0;
}
