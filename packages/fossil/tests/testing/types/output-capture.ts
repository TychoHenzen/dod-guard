export interface OutputCapture {
  writeStdout(text: string): void;
  writeStderr(text: string): void;
  stdout(): string;
  stderr(): string;
}
