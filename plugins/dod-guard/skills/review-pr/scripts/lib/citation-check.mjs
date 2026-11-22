// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import path from "node:path";

const NEWLINE = 10;

// A cited path must stay under the checkout; an absolute path inside it is fine.
function insideRoot(root, cited) {
  const file = path.resolve(root, cited);
  const relative = path.relative(root, file);
  const escapes = path.isAbsolute(relative) || relative.split(path.sep)[0] === "..";
  if (escapes) {
    return null;
  }
  return file;
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

// Builds the check for one checkout. It reads each cited file once.
function citationCheck(root) {
  const cache = new Map();
  return (cited, line) => {
    const named = JSON.stringify(cited);
    const file = insideRoot(root, cited);
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
