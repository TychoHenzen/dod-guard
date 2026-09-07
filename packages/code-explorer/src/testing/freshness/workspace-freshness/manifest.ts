import { type ReconcileResult } from "../../../freshness/reconcile-result.js";

export function manifest(entries: Record<string, string>): ReconcileResult {
  return { manifest: new Map(Object.entries(entries)) };
}
