// --- Frontmatter parsing ---

function parseFrontmatterLine(fm, line, current) {
  const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line);
  if (kv) return { key: kv[1], val: kv[2].trim() };
  if (current && /^\s+/.test(line)) return { key: current, val: `${fm[current]} ${line.trim()}` };
  return null;
}

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const fm = {};
  let current = null;
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = parseFrontmatterLine(fm, line, current);
    if (!parsed) continue;
    current = parsed.key;
    fm[parsed.key] = parsed.val;
  }
  return fm;
}

export function bodyAfterFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return match ? match[1] : text;
}

// The frontmatter parser above flattens an indented continuation line onto
// its parent key, so a nested block like `metadata:\n  type: user` never
// becomes a nested object. Kind-specific checks that need a nested value
// read it back out of the raw frontmatter text instead.

export function rawFrontmatterText(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match ? match[1] : "";
}

export function cleanDescription(fm) {
  return (fm.description ?? "").replace(/^>-?\s*/, "").trim();
}

// --- Shared line iterator (skips code fences) ---

export function proseLines(body) {
  const raw = body.split(/\r?\n/);
  const result = [];
  let inFence = false;
  for (let i = 0; i < raw.length; i++) {
    if (/^\s*```/.test(raw[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) result.push({ text: raw[i], line: i + 1 });
  }
  return result;
}

// --- Fenced block scanner (for worked-example detection) ---

export function fencedBlocks(body) {
  const raw = body.split(/\r?\n/);
  const blocks = [];
  let start = -1;
  let lang = "";
  for (let i = 0; i < raw.length; i++) {
    const fence = /^\s*```(\w*)/.exec(raw[i]);
    if (!fence) continue;
    if (start < 0) {
      start = i + 1;
      lang = fence[1];
      continue;
    }
    blocks.push({ start, end: i, lang, lines: raw.slice(start, i) });
    start = -1;
  }
  return blocks;
}
