// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { closeSync, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import path from "node:path";

const NEWLINE = 10;

function contains(root, file) {
  const relative = path.relative(root, file);
  return !(path.isAbsolute(relative) || relative.split(path.sep)[0] === "..");
}

// Follows every symlink in the path, or returns null when the path does not exist.
function realPath(file) {
  try {
    return realpathSync(file);
  } catch {
    return null;
  }
}

// A cited path must stay under the checkout; an absolute path inside it is fine.
// Containment is checked on the path as written and again after following
// symlinks, so a link inside the checkout cannot point at a file outside it.
// Returns the real path to read, the written path when nothing exists there, or
// null when the path leaves the checkout.
function insideRoot(root, realRoot, cited) {
  const file = path.resolve(root, cited);
  if (!contains(root, file)) {
    return null;
  }
  const real = realPath(file);
  if (real === null) {
    return file;
  }
  if (!contains(realRoot, real)) {
    return null;
  }
  return real;
}

// Returns the number of lines of a regular file, or null when the path is not a readable file.
// The type check and the read go through one descriptor, so the file cannot be swapped between them.
function countLines(file) {
  let fd = null;
  try {
    fd = openSync(file, "r");
    if (!fstatSync(fd).isFile()) {
      return null;
    }
    const bytes = readFileSync(fd);
    const breaks = bytes.filter((byte) => byte === NEWLINE).length;
    const endsMidLine = bytes.length > 0 && bytes.at(-1) !== NEWLINE;
    return breaks + Number(endsMidLine);
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}

function linesOf(file, cache) {
  if (!cache.has(file)) {
    cache.set(file, countLines(file));
  }
  return cache.get(file);
}

// Returns the real path of an absolute citation that names one of the allowed
// facts files, or null for every other citation.
function factFile(allowed, cited) {
  if (!path.isAbsolute(cited)) {
    return null;
  }
  const real = realPath(cited);
  if (real === null || !allowed.has(real)) {
    return null;
  }
  return real;
}

// Builds the check for one checkout. It reads each cited file once.
// `facts` lists files outside the checkout that may be cited as well, such as
// a file of Git facts written for investigators that cannot run Git. Each is
// matched by its real path, so only those exact files pass, never a file next
// to one. A facts file that does not exist allows nothing.
function citationCheck(root, facts = []) {
  const cache = new Map();
  const realRoot = realPath(root) ?? root;
  const allowed = new Set(facts.map(realPath).filter((real) => real !== null));
  return (cited, line) => {
    const named = JSON.stringify(cited);
    const file = factFile(allowed, cited) ?? insideRoot(root, realRoot, cited);
    if (file === null) {
      return `${named} is outside the checkout`;
    }
    const lines = linesOf(file, cache);
    if (lines === null) {
      return `${named} is not a file under the checkout`;
    }
    if (line > lines) {
      return `${named} has ${lines} lines, so line ${line} does not exist`;
    }
    return null;
  };
}

export { citationCheck };
