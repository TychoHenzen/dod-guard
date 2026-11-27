// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { realpathSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import path from "node:path";

// Follows every symlink in the path, or returns null when the path does not exist.
function realPath(file) {
  try {
    return realpathSync(file);
  } catch {
    return null;
  }
}

// Matches a citation against one file outside the checkout that may be cited
// as well, such as a file of Git facts written for investigators that cannot
// run Git. The match is on real paths, so only that exact file passes, never a
// file next to it. Returns its real path on a match, else null. With no file,
// or a file that does not exist, nothing matches.
function exactFile(file) {
  if (!file) {
    return () => null;
  }
  const allowed = realPath(file);
  return (cited) => {
    if (allowed === null || !path.isAbsolute(cited) || realPath(cited) !== allowed) {
      return null;
    }
    return allowed;
  };
}

export { exactFile, realPath };
