export type Entry = {
  realpath: string;
  dev: number;
  ino: number;
};

function requiredEntry(entries: Record<string, Entry>, path: string): Entry {
  const entry = entries[path] ?? entries[path.replaceAll("\\", "/")];
  if (!entry) throw new Error("ENOENT");
  return entry;
}

export function filesystem(entries: Record<string, Entry>) {
  return {
    realpath(path: string) {
      return requiredEntry(entries, path).realpath;
    },
    stat(path: string) {
      const entry = requiredEntry(entries, path);
      return { dev: entry.dev, ino: entry.ino };
    },
    open(path: string) {
      requiredEntry(entries, path);
      return path;
    },
    fstat(handle: string) {
      return this.stat(handle);
    },
    read() {
      return "fixture";
    },
    close() {},
  };
}

export function windowsProjectFilesystem(
  root: string,
  rootDevice = 1,
  fileDevice = rootDevice,
) {
  return filesystem({
    [root]: { realpath: root, dev: rootDevice, ino: 1 },
    [`${root}/src/lib.rs`]: {
      realpath: `${root}/src/lib.rs`,
      dev: fileDevice,
      ino: 2,
    },
  });
}
