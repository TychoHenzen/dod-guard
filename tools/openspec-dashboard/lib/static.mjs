// static.mjs - serve the public folder.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function resolveFile(root, urlPath) {
  const wanted = urlPath === "/" ? "/index.html" : urlPath;
  const file = join(root, normalize(wanted).replace(/^[/\\]+/, ""));
  if (!file.startsWith(root + sep)) return null;
  try {
    const stats = await stat(file);
    return stats.isFile() ? file : null;
  } catch {
    return null;
  }
}

export async function serveStatic(root, urlPath, res) {
  const file = await resolveFile(root, urlPath);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "max-age=5" });
  createReadStream(file).pipe(res);
}
