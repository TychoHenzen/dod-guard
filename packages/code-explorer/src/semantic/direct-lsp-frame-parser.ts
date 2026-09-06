import { isRpcMessage } from "./direct-lsp-protocol.js";

export function decodeHeader(bytes: Uint8Array): string | undefined {
  if (bytes.some((value) => value > 127)) return undefined;
  try {
    const header = new TextDecoder("ascii", {
      fatal: true,
    }).decode(bytes);
    return /^Content-Length: [0-9]+$/.test(header) ? header : undefined;
  } catch {
    return undefined;
  }
}

export function bodyLength(header: string): number | undefined {
  const length = Number(header.slice("Content-Length: ".length));
  return Number.isSafeInteger(length) ? length : undefined;
}

export function decodeBody(bytes: Uint8Array): unknown {
  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return isRpcMessage(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}
