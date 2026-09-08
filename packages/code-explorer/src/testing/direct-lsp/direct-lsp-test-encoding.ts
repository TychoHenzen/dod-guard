export function encode(value: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(value));
  return new TextEncoder().encode(
    `Content-Length: ${body.length}\r\n\r\n${new TextDecoder().decode(body)}`,
  );
}

export function decode(frame: Uint8Array): unknown {
  const value = new TextDecoder().decode(frame);
  const boundary = value.indexOf("\r\n\r\n");
  return JSON.parse(value.slice(boundary + 4));
}
