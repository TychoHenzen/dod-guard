// Build output and Godot sidecars are never reviewable source.
const GENERATED_FRAGMENTS = ["/dist/", "/dist-test/", "/node_modules/"];
const SIDECAR_EXTENSIONS = [".uid", ".import"];

// Matches whole path segments, so "distance.js" and "mydist/" are not flagged.
function isGeneratedPath(path) {
  return (
    GENERATED_FRAGMENTS.some((fragment) => `/${path}`.includes(fragment)) ||
    SIDECAR_EXTENSIONS.some((extension) => path.endsWith(extension))
  );
}

export { GENERATED_FRAGMENTS, isGeneratedPath, SIDECAR_EXTENSIONS };
