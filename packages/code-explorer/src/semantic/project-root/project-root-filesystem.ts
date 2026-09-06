import type { FileIdentity } from "./project-root-file-identity.js";

export type ProjectFilesystem<Handle = unknown> = {
  realpath(path: string): string;
  stat(path: string): FileIdentity;
  open(path: string, options: { noFollow: true }): Handle;
  fstat(handle: Handle): FileIdentity;
  read(handle: Handle): string;
  close(handle: Handle): void;
};
