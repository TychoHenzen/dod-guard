import type { FreshnessCause } from "./freshness-cause.js";
import type { Manifest } from "./manifest.js";

export type ReconcileResult =
  | { manifest: Manifest }
  | { cause: FreshnessCause };
