export type LspProcess = {
  write(chunk: Uint8Array): void;
  onStdout(listener: (chunk: Uint8Array) => void): void;
  onExit(listener: () => void): void;
  onError?(listener: () => void): void;
  kill(): void;
};
