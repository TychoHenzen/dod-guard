import { inTestRegion } from "./rules-file-rust-tests.mjs";

function manifestHits(pattern, manifests) {
  let hits = 0;
  for (const manifest of manifests)
    hits += manifest.text.match(pattern)?.length ?? 0;
  return hits;
}

function capturesNamed(scan, name) {
  return (scan.interpolations ?? []).filter((id) => id.name === name);
}

function captureOffset(scan, id) {
  return (scan.starts ?? [])[id.line - 1] ?? 0;
}

function matchCount(scan, pattern) {
  return scan.code.match(pattern)?.length ?? 0;
}

function ownDeclaration(file, own, offset) {
  return file.rel === own.file && offset === own.offset;
}

function rustFileEvidence(pattern, entry, own) {
  const { file, scan } = entry;
  const regions = scan.testRegions ?? [];
  const offsets = [...scan.code.matchAll(pattern)].map((match) => match.index);
  const external = offsets.filter(
    (offset) => !ownDeclaration(file, own, offset),
  );
  const captures = capturesNamed(scan, own.name);
  const codeTest = external.filter((offset) =>
    inTestRegion(regions, offset),
  ).length;
  const captureTest = captures.filter((id) =>
    inTestRegion(regions, captureOffset(scan, id)),
  ).length;
  const test = codeTest + captureTest;
  return { prod: external.length + captures.length - test, test };
}

function plainFileEvidence(pattern, entry, own) {
  const { file, scan } = entry;
  const total =
    matchCount(scan, pattern) + capturesNamed(scan, own.name).length;
  if (total === 0) return { prod: 0, test: 0 };
  return file.isTest ? { prod: 0, test: total } : { prod: total, test: 0 };
}

function fileEvidence(pattern, entry, own) {
  if (entry.file.lang === "rs") return rustFileEvidence(pattern, entry, own);
  if (entry.file.rel === own.file) return { prod: 0, test: 0 };
  return plainFileEvidence(pattern, entry, own);
}

export function referenceCounts(name, corpus, own) {
  const pattern = new RegExp(`\\b${name}\\b`, "g");
  const ownSymbol = { ...own, name };
  let prod = manifestHits(pattern, corpus.manifests);
  let test = 0;
  for (const file of corpus.files) {
    const scan = corpus.scans.get(file.rel);
    const evidence = fileEvidence(pattern, { file, scan }, ownSymbol);
    prod += evidence.prod;
    test += evidence.test;
  }
  return { prod, test };
}
