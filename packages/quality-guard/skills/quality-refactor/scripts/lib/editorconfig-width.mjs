// Finds the EditorConfig max_line_length that governs one file, so line-length
// judges a file Biome never formats (C#, Rust, Go, ...) against the width its
// repository declares instead of the fixed 80/120 limits.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchesSection } from "./editorconfig-glob.mjs";

const FILE_NAME = ".editorconfig";

// Keeps the last value per section and whether the preamble sets root = true.
function parseEditorconfig(text) {
  let root = false;
  const sections = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      current = { pattern: line.slice(1, -1), maxLineLength: undefined };
      sections.push(current);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (current === null) {
      if (key === "root" && value.toLowerCase() === "true") root = true;
    } else if (key === "max_line_length") {
      current.maxLineLength = value;
    }
  }
  return { root, sections };
}

// Only a positive integer is a width. "off" and anything else is no value.
// ASSUMPTION: "off" falls back to the default instead of meaning no limit,
// because no limit would silence line-length for the whole file.
function validWidth(value) {
  const width = Number(value);
  return Number.isInteger(width) && width > 0 ? width : null;
}

// The last section whose pattern covers the file decides for this config.
// A bad value there is a "no value" answer, so the search keeps climbing.
function widthIn(config, relFromConfigDir) {
  let decided;
  for (const section of config.sections) {
    if (section.maxLineLength === undefined) continue;
    if (matchesSection(section.pattern, relFromConfigDir)) {
      decided = section.maxLineLength;
    }
  }
  return decided === undefined ? null : validWidth(decided);
}

function readConfig(root, dir) {
  const path = resolve(root, dir, FILE_NAME);
  if (!existsSync(path)) return null;
  return parseEditorconfig(readFileSync(path, "utf8"));
}

function lookUp(configAt, relFile) {
  const segments = relFile.split("/");
  for (let depth = segments.length - 1; depth >= 0; depth -= 1) {
    const dir = segments.slice(0, depth).join("/");
    const config = configAt(dir);
    if (config === null) continue;
    const relFromDir = dir === "" ? relFile : relFile.slice(dir.length + 1);
    const width = widthIn(config, relFromDir);
    if (width !== null) {
      const source = dir === "" ? FILE_NAME : `${dir}/${FILE_NAME}`;
      return { width, source };
    }
    if (config.root) return null;
  }
  return null;
}

/**
 * Build a resolver for one scan. It maps a root-relative POSIX path to
 * `{ width, source }`, where `source` is the deciding .editorconfig relative
 * to `root`, or null when no value governs the file or any read fails.
 */
export function createEditorconfigResolver(root) {
  const configs = new Map();
  const configAt = (dir) => {
    if (!configs.has(dir)) configs.set(dir, readConfig(root, dir));
    return configs.get(dir);
  };
  return (relFile) => {
    try {
      return lookUp(configAt, relFile);
    } catch {
      return null;
    }
  };
}
