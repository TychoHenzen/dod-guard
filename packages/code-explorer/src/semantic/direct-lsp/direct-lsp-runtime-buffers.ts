import { concatBytes } from "./direct-lsp-frame-parser.js";

export class DirectLspRuntimeBuffers {
  #bytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;

  reset(): void {
    this.#bytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  }

  append(chunk: Uint8Array): void {
    this.#bytes = concatBytes(this.#bytes, chunk);
  }

  length(): number {
    return this.#bytes.length;
  }

  slice(start?: number, end?: number): Uint8Array {
    return this.#bytes.slice(start, end);
  }

  consume(end: number): void {
    this.#bytes = this.#bytes.slice(end);
  }
}
