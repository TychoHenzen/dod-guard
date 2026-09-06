export type PythonMirrorOptions = {
  generation: number;
  mirror_uri_root: string;
  bundled_typeshed: readonly string[];
  filesystem?: {
    writeFile(path: string, text: string): void;
    makeReadOnly(): void;
  };
};
