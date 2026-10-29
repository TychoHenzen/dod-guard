// One reader for every file a skill script takes from a path the user or an
// agent can fill with a shell redirect. Windows PowerShell 5.1 `>` writes
// UTF-16 with a byte-order mark, so a marked UTF-16 file is decoded instead of
// failing later with an unrelated JSON or heading error. Anything else that is
// not strict UTF-8 is refused by name.
import { readFileSync } from "node:fs";

const NOT_UTF8 = "is not UTF-8 text; save it as UTF-8";
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const UTF16LE = new TextDecoder("utf-16le", { fatal: true });
const BOM_LENGTH = 2;
const BYTE_FF = 0xff;
const BYTE_FE = 0xfe;

class TextEncodingError extends Error {
  constructor(message = NOT_UTF8, options = {}) {
    super(message, options);
    this.name = "TextEncodingError";
  }
}

function decodeUtf16(payload, bigEndian) {
  if (payload.length % BOM_LENGTH !== 0) {
    throw new TextEncodingError();
  }
  return UTF16LE.decode(bigEndian ? Buffer.from(payload).swap16() : payload);
}

// A leading UTF-8 byte-order mark is dropped by the strict UTF-8 decoder. A
// file without a mark that holds a NUL byte is UTF-16 text without its mark,
// which cannot be told apart from binary data, so it is refused.
function decodeText(bytes) {
  try {
    const payload = bytes.subarray(BOM_LENGTH);
    if (bytes[0] === BYTE_FF && bytes[1] === BYTE_FE) {
      return decodeUtf16(payload, false);
    }
    if (bytes[0] === BYTE_FE && bytes[1] === BYTE_FF) {
      return decodeUtf16(payload, true);
    }
    if (bytes.includes(0)) {
      throw new TextEncodingError();
    }
    return UTF8.decode(bytes);
  } catch (error) {
    throw new TextEncodingError(NOT_UTF8, { cause: error });
  }
}

function readTextFile(path) {
  const bytes = readFileSync(path);
  try {
    return decodeText(bytes);
  } catch (error) {
    throw new TextEncodingError(`${path} ${NOT_UTF8}`, { cause: error });
  }
}

function readJsonFile(path) {
  try {
    return JSON.parse(readTextFile(path));
  } catch (error) {
    throw new Error(`Cannot read JSON from ${path}: ${error.message}`, { cause: error });
  }
}

export { decodeText, NOT_UTF8, readJsonFile, readTextFile, TextEncodingError };
