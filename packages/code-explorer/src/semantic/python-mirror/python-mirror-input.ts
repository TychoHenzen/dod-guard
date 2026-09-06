export type PythonMirrorInput = {
  path: string;
  sha256: string;
  text: string;
  symlink?: boolean;
  sensitive?: boolean;
};
