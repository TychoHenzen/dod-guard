export interface GitPipedChild {
  readonly stdout: {
    on(event: "data", listener: (chunk: Buffer) => void): unknown;
  } | null;
  readonly stderr: {
    on(event: "data", listener: (chunk: Buffer) => void): unknown;
  } | null;
  once(event: "close", listener: (code: number | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  kill(): boolean;
}
