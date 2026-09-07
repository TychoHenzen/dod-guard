import type { LandmarkCandidate } from "../../../discovery/landmarks.js";
export function practiceCandidate(
  identity: [id: string, name: string, path: string, kind: string],
  options: Omit<LandmarkCandidate, "symbol">,
): LandmarkCandidate {
  const [symbol_id, name, path, kind] = identity;
  return { symbol: { symbol_id, name, path, kind }, ...options };
}

export function productionReference(path = "app/consumer.ts") {
  return { path, content: "production" as const };
}
