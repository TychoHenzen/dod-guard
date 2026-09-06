export type PythonMirror = {
  root: string;
  generation: number;
  sourcePaths(): readonly string[];
  uriFor(path: string): string;
  pathForUri(uri: string): string | undefined;
  dispose(): void;
  disposeAfterShutdown(shutdown: () => void | Promise<void>): Promise<void>;
};
