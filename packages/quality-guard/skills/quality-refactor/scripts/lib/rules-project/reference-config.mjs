import { loadTarget } from "./reference-target.mjs";

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasKey(value, key) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  return Object.entries(value).some(
    ([name, child]) => name === key || hasKey(child, key),
  );
}

function configKeyPresent(source, key) {
  try {
    return hasKey(JSON.parse(source), key);
  } catch {
    return new RegExp(
      String.raw`^\s*["']?${escaped(key)}["']?\s*(?:[:=]|$)`,
      "m",
    ).test(source);
  }
}

function configResult(loaded, key) {
  if (loaded.kind === "missing") return true;
  if (loaded.kind === "unavailable") return null;
  if (!/\.json$/i.test(loaded.path)) return !configKeyPresent(loaded.source, key);
  try {
    return !hasKey(JSON.parse(loaded.source), key);
  } catch {
    return null;
  }
}

function remember(cache, key, value) {
  cache.results.set(key, value);
  return value;
}

export function missingConfig({ target, key, root, cache }) {
  const resultKey = `config:${target}:${key}`;
  if (cache.results.has(resultKey)) return cache.results.get(resultKey);
  return remember(
    cache,
    resultKey,
    configResult(loadTarget(root, target, cache), key),
  );
}
