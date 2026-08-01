// A target with an existing test suite is cheaper and safer to rewrite: the
// suite is already an oracle. A target without one needs characterization tests
// written first, and those carry the risk of pinning accidental behavior. The
// ledger records which kind each target is so the loop takes the safe wins first.

const SUFFIXES = ["test", "spec"];

function split(file) {
  const path = file.replace(/\\/g, "/");
  const cut = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (cut <= slash + 1) {
    return null;
  }
  return {
    dir: slash === -1 ? "" : path.slice(0, slash + 1),
    stem: path.slice(slash + 1, cut),
    ext: path.slice(cut + 1),
  };
}

function oracleCandidates(file) {
  const parts = split(file);
  if (!parts) {
    return [];
  }
  const { dir, stem, ext } = parts;
  return SUFFIXES.flatMap((suffix) => [
    `${dir}${stem}.${suffix}.${ext}`,
    `${dir}__tests__/${stem}.${suffix}.${ext}`,
  ]);
}

export function hasOracle(file, exists) {
  return oracleCandidates(file).some(exists);
}
