export type Entry = {
  realpath: string;
  dev: number;
  ino: number;
};

export function filesystem(entries: Record<string, Entry>) {
  const entryFor = (path: string): Entry | undefined =>
    entries[path] ?? entries[path.replaceAll("\\", "/")];
  return {
    realpath(path: string) {
      const entry = entryFor(path);
      if (!entry) throw new Error("ENOENT");
      return entry.realpath;
    },
    stat(path: string) {
      const entry = entryFor(path);
      if (!entry) throw new Error("ENOENT");
      return { dev: entry.dev, ino: entry.ino };
    },
    open(path: string) {
      const entry = entryFor(path);
      if (!entry) throw new Error("ENOENT");
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
