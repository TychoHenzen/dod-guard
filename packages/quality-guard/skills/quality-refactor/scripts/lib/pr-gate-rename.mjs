// duplicate-block messages name `path:line` sites: map whole base paths to
// HEAD paths so a renamed file's findings keep their key.
export function renameInMessages(base, files) {
  const moves = new Map(
    files
      .filter((f) => f.basePath && f.basePath !== f.path)
      .map((f) => [f.basePath, f.path]),
  );
  if (moves.size === 0) return base;
  const quote = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paths = [...moves.keys()].map(quote).join("|");
  const site = new RegExp(`(?<![^\\s,(])(?:${paths})(?=:)`, "g");
  const rename = (text) => text.replace(site, (p) => moves.get(p));
  return base.map((v) => ({ ...v, message: rename(v.message) }));
}
