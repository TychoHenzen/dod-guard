import {
  DEFAULT_THRESHOLDS,
  DUPLICATE_WINDOW,
  LANG_BY_EXT,
  PRESENCE_SEVERITY,
} from "./config-values.mjs";
import {
  ENTRY_PATTERNS,
  IGNORED_DIRS,
  IGNORED_FILE_PATTERNS,
  MANIFEST_EXTS,
  TEST_PATTERNS,
} from "./config-path-values.mjs";

export {
  DEFAULT_THRESHOLDS,
  DUPLICATE_WINDOW,
  IGNORED_DIRS,
  IGNORED_FILE_PATTERNS,
  LANG_BY_EXT,
  MANIFEST_EXTS,
};

export const ALL_RULES = [
  ...Object.keys(DEFAULT_THRESHOLDS),
  ...Object.keys(PRESENCE_SEVERITY),
];

export const ACTIVE_PROFILE = "advisory";
export const PROFILE_ALIASES = [ACTIVE_PROFILE, "default", "strict"];

export function normalizeProfile(profile = ACTIVE_PROFILE) {
  if (!PROFILE_ALIASES.includes(profile))
    throw new Error(`unknown quality profile: ${profile}`);
  return ACTIVE_PROFILE;
}

export function buildConfig(profile = ACTIVE_PROFILE) {
  normalizeProfile(profile);
  const thresholds = structuredClone(DEFAULT_THRESHOLDS);
  const presence = { ...PRESENCE_SEVERITY };
  return { profile: ACTIVE_PROFILE, thresholds, presence };
}

export function severityFor(config, rule, value) {
  const bounds = config.thresholds[rule];
  if (!bounds) return null;
  if (above(bounds.high, value)) return "high";
  if (above(bounds.medium, value)) return "medium";
  return null;
}

function above(limit, value) {
  return limit !== null && value > limit;
}

export function isTestPath(relPath, extraFragments = []) {
  if (TEST_PATTERNS.some((pattern) => pattern.test(relPath))) return true;
  return extraFragments.some((fragment) => relPath.includes(fragment));
}

export function isEntryPath(relPath) {
  return ENTRY_PATTERNS.some((pattern) => pattern.test(relPath));
}
